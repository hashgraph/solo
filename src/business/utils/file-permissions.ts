// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import * as os from 'node:os';
import {execFileSync} from 'node:child_process';
import {OperatingSystem} from './operating-system.js';
import {PathEx} from './path-ex.js';
import {SubprocessEnvironment} from '../../core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';

/**
 * Cross-platform helper for restricting filesystem access to the current user only.
 *
 * POSIX systems express this through mode bits; Windows has no mode bits and instead uses NTFS ACLs,
 * so the two platforms need different mechanisms to achieve the same "owner-only" outcome.
 */
export class FilePermissions {
  /**
   * Restrict a path so that only the current user can access it.
   *
   * - POSIX: `chmod` to `0700` for directories or `0600` for files. Failures throw, since a chmod of a
   *   path we just created is reliable and a failure is meaningful.
   * - Windows: removes inherited ACEs and grants the current user Full control via `icacls`; for
   *   directories the grant is propagated to children through object/container inheritance so files
   *   created inside inherit the same restriction. This is best-effort — ACL changes can legitimately
   *   fail (non-NTFS volume, insufficient rights) and Windows does not share the POSIX group/other
   *   read exposure this hardening targets, so a failure is swallowed rather than aborting the caller.
   *
   * @param targetPath - the file or directory to restrict; it must already exist
   * @param isDirectory - whether {@link targetPath} is a directory
   */
  public static restrictToOwner(targetPath: string, isDirectory: boolean): void {
    if (OperatingSystem.isWin32()) {
      FilePermissions.restrictToOwnerWindows(targetPath, isDirectory);
      return;
    }

    fs.chmodSync(targetPath, isDirectory ? 0o700 : 0o600);
  }

  /**
   * Recursively restrict a directory tree so no entry is accessible beyond the owner (and group read).
   * Each entry keeps its owner bits but loses group-write and every "other" bit, mirroring a
   * 0027 umask (0755 -> 0750, 0644 -> 0640).
   *
   * Use this after copying packaged resources into $SOLO_HOME: `fs.cpSync`/`fs.copyFileSync` preserve
   * the (wider) source mode and bypass the process umask, so copied files can land as 0755.
   *
   * On Windows this applies an inherited owner-only ACL to the root, which children inherit.
   * @param rootPath - the file or directory to restrict; it must already exist
   */
  public static restrictTreeToOwner(rootPath: string): void {
    if (OperatingSystem.isWin32()) {
      FilePermissions.restrictToOwnerWindows(rootPath, true);
      return;
    }

    FilePermissions.clearGroupAndOtherAccess(rootPath);
    if (!fs.statSync(rootPath).isDirectory()) {
      return;
    }
    for (const relativeEntry of fs.readdirSync(rootPath, {recursive: true}) as string[]) {
      FilePermissions.clearGroupAndOtherAccess(PathEx.join(rootPath, relativeEntry));
    }
  }

  /**
   * Clear group-write and all "other" permission bits from a single path, keeping the owner bits
   * (0755 -> 0750, 0644 -> 0640). This is the POSIX equivalent of applying a 0027 umask to an
   * already-created path.
   * @param targetPath - the file or directory to restrict
   */
  private static clearGroupAndOtherAccess(targetPath: string): void {
    const currentMode: number = fs.statSync(targetPath).mode & 0o777;
    fs.chmodSync(targetPath, currentMode & ~0o027);
  }

  /**
   * Windows implementation of {@link restrictToOwner} using the built-in `icacls` tool.
   * @param targetPath - the file or directory to restrict
   * @param isDirectory - whether {@link targetPath} is a directory
   */
  private static restrictToOwnerWindows(targetPath: string, isDirectory: boolean): void {
    const username: string = os.userInfo().username;
    const domain: string | undefined = process.env.USERDOMAIN;
    const principal: string = domain ? `${domain}\\${username}` : username;

    // `(OI)(CI)` propagates the grant to files and subdirectories created inside a directory so they
    // inherit the same owner-only restriction; plain `F` (Full control) is used for a single file.
    const permissions: string = isDirectory ? '(OI)(CI)F' : 'F';

    try {
      // `/inheritance:r` drops all inherited ACEs (removing the broad BUILTIN\Users access that is the
      // Windows analogue of group/other), and `/grant:r` replaces any existing grant for the user.
      execFileSync('icacls', [targetPath, '/inheritance:r', '/grant:r', `${principal}:${permissions}`], {
        shell: false,
        stdio: 'ignore',
        env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC),
      });
    } catch {
      // best-effort: ACL hardening can fail on non-NTFS volumes or with insufficient rights; the POSIX
      // group/other read exposure this guards against does not apply on Windows, so do not abort here.
    }
  }
}
