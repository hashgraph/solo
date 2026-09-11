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
   * Principals whose write access to a Windows path does not make it untrusted: the current user,
   * the OS itself, and local administrators. An administrator can already act as the user, so
   * treating their access as a compromise would reject every default installation.
   */
  private static readonly WINDOWS_TRUSTED_PRINCIPAL_PATTERNS: readonly RegExp[] = [
    /^NT AUTHORITY\\SYSTEM$/i,
    /^BUILTIN\\Administrators$/i,
    /^CREATOR OWNER$/i,
    /^NT SERVICE\\TrustedInstaller$/i,
  ];

  /**
   * ACL rights that let a principal modify a path, replace it, or acquire the ability to do either.
   *
   * The last group matters as much as the obvious write rights and is easy to miss: `WDAC` lets a
   * principal rewrite the DACL and simply grant itself Full control, and `WO` lets it take
   * ownership — and an owner implicitly holds DACL-write. Either one is a complete bypass of every
   * other entry here, so omitting them would let an untrusted principal widen subprocess
   * environment forwarding in two steps rather than one.
   */
  private static readonly WINDOWS_WRITE_RIGHTS: readonly string[] = [
    // simple rights
    'F', // full control
    'M', // modify
    'W', // write
    'D', // delete
    // generic rights
    'GW', // generic write
    'GA', // generic all
    // specific rights: content and metadata
    'WD', // write data / add file
    'AD', // append data / add subdirectory
    'WA', // write attributes
    'WEA', // write extended attributes
    'DC', // delete child
    'DE', // delete
    // specific rights: escalation to everything above
    'WDAC', // write DAC - can grant itself any right
    'WO', // write owner - can take ownership, and an owner holds DACL-write
  ];

  /**
   * Reports why a path cannot be trusted as owner-controlled input, or `undefined` when it can.
   *
   * Used before honouring a configuration file whose contents widen what Solo forwards to external
   * commands. `restrictToOwner` hardens paths *Solo* creates; this is the complementary check for a
   * path the *user* created, where Solo's umask never applied.
   *
   * Rejects symbolic links on every platform — the target can be swapped for something outside the
   * user's control. Beyond that the check is platform-specific but equivalent in intent:
   *
   * - POSIX: the path must be owned by the current user and must not be group- or other-writable.
   * - Windows: there are no mode bits or uids, so the DACL is inspected with `icacls` and any write
   *   grant to a principal other than the current user, SYSTEM, Administrators or CREATOR OWNER
   *   makes the path untrusted. A DACL can grant another user write access regardless of location,
   *   so skipping this would leave the Windows trust boundary unenforced.
   *
   * @param targetPath - the file or directory to inspect; it must already exist
   * @returns a human-readable reason the path is untrusted, or `undefined` if it is acceptable
   */
  public static findUntrustedOwnershipReason(targetPath: string): string | undefined {
    const stats: fs.Stats = fs.lstatSync(targetPath);

    if (stats.isSymbolicLink()) {
      return 'it is a symbolic link, whose target could be replaced by another user';
    }

    return OperatingSystem.isWin32()
      ? FilePermissions.findUntrustedWindowsAclReason(targetPath)
      : FilePermissions.findUntrustedPosixModeReason(stats);
  }

  /**
   * Reports why a directory on the way to the config file is untrusted, or `undefined` when none is.
   *
   * Checking only the file is not enough: write access to a directory above it is enough to replace
   * the file inside it, and with a custom `SOLO_HOME` that directory may be far less protected than
   * a home directory.
   *
   * **How far the walk goes is platform-specific, deliberately.**
   *
   * On POSIX it walks to the filesystem root. Ancestors are judged more leniently than the file,
   * because the normal layout demands it: `/`, `/Users` and `/var/folders/...` are root-owned, so
   * an ancestor is acceptable when owned by the current user *or* root. A world-writable directory
   * carrying the sticky bit (`/tmp`) is acceptable too, since the sticky bit stops one user
   * removing another's entries. The path is resolved through symlinks first, because `/var` is a
   * symlink to `/private/var` on macOS.
   *
   * On Windows the walk stops at the volume root's child: `C:\` legitimately carries write grants
   * for broad principals, so applying the POSIX-style walk there rejects every ordinary
   * installation. Checking `C:\` is also of little value — anyone able to write it already
   * controls the machine. This is a narrower guarantee than POSIX, and is stated as such.
   *
   * @param startDirectory - the directory to begin from; it must already exist
   * @returns a human-readable reason a directory is untrusted, or `undefined` if all are acceptable
   */
  public static findUntrustedAncestorReason(startDirectory: string): string | undefined {
    let current: string = PathEx.realPathSync(PathEx.resolve(startDirectory));
    while (true) {
      const parent: string = PathEx.dirname(current);

      // On Windows, stop before inspecting the volume root itself.
      if (OperatingSystem.isWin32() && parent === current) {
        return undefined;
      }

      const reason: string | undefined = FilePermissions.findUntrustedDirectoryReason(current);
      if (reason) {
        return `${current} is untrusted: ${reason}`;
      }

      if (parent === current) {
        return undefined;
      }
      current = parent;
    }
  }

  /** Single-directory half of {@link findUntrustedAncestorReason}. */
  private static findUntrustedDirectoryReason(directoryPath: string): string | undefined {
    if (OperatingSystem.isWin32()) {
      return FilePermissions.findUntrustedWindowsAclReason(directoryPath);
    }

    const stats: fs.Stats = fs.statSync(directoryPath);
    // The sticky bit stops one user removing another's entries, which is exactly the replacement
    // this walk guards against, so a sticky directory is acceptable however permissive its mode.
    if ((stats.mode & 0o1000) !== 0) {
      return undefined;
    }
    if ((stats.mode & 0o022) !== 0) {
      return 'it is writable by group or other users';
    }
    const currentUserId: number | undefined = process.getuid?.();
    if (typeof currentUserId === 'number' && stats.uid !== currentUserId && stats.uid !== 0) {
      return 'it is owned by neither the current user nor root';
    }
    return undefined;
  }

  /**
   * Reports why an already-opened file cannot be trusted, or `undefined` when it can.
   *
   * Takes the {@link fs.Stats} from `fstat` on the descriptor being read, rather than re-statting
   * the path, so the answer describes the exact inode whose bytes the caller consumes. On Windows
   * there are no mode bits on the descriptor, so the path's DACL is inspected instead.
   *
   * @param targetPath - the path the descriptor was opened from, used for the Windows ACL lookup
   * @param descriptorStats - result of `fstat` on the open descriptor
   * @returns a human-readable reason the file is untrusted, or `undefined` if it is acceptable
   */
  public static findUntrustedDescriptorReason(targetPath: string, descriptorStats: fs.Stats): string | undefined {
    return OperatingSystem.isWin32()
      ? FilePermissions.findUntrustedWindowsAclReason(targetPath)
      : FilePermissions.findUntrustedPosixModeReason(descriptorStats);
  }

  /** POSIX ownership and mode-bit half of {@link findUntrustedOwnershipReason}. */
  private static findUntrustedPosixModeReason(stats: fs.Stats): string | undefined {
    if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
      return 'it is not owned by the current user';
    }

    // 0o022 == group-write | other-write.
    if ((stats.mode & 0o022) !== 0) {
      return 'it is writable by group or other users';
    }

    return undefined;
  }

  /**
   * Windows DACL half of {@link findUntrustedOwnershipReason}.
   *
   * `icacls <path>` prints `<path> PRINCIPAL:(RIGHTS)` on its first line and `PRINCIPAL:(RIGHTS)`
   * on the rest. A principal may contain spaces (`NT AUTHORITY\SYSTEM`, `CREATOR OWNER`) and an
   * ACE may carry several parenthesised groups (`(OI)(CI)(M)`), so both are parsed in full: an
   * earlier version captured only the first group, read `(OI)(CI)(M)` as `OI`, and therefore
   * missed the Modify grant entirely — a fail-open bug.
   */
  private static findUntrustedWindowsAclReason(targetPath: string): string | undefined {
    let output: string;
    try {
      output = execFileSync('icacls', [targetPath], {
        encoding: 'utf8',
        env: SubprocessEnvironment.forCommand(SubprocessCommandProfile.GENERIC),
        shell: false,
      });
    } catch {
      // Unlike restrictToOwner's best-effort hardening, an unreadable DACL cannot be waved through
      // here: the whole point of the check is to refuse what we cannot prove safe.
      return 'its access control list could not be read';
    }

    return FilePermissions.findUntrustedAceInIcaclsOutput(
      targetPath,
      output,
      FilePermissions.currentWindowsPrincipal(),
    );
  }

  /**
   * Pure parser behind {@link findUntrustedWindowsAclReason}, split out so the security-critical
   * matching can be unit-tested on any platform against captured `icacls` output rather than only
   * on a Windows runner.
   *
   * @param targetPath - the path whose DACL was listed, stripped from the first output line
   * @param output - raw `icacls` output
   * @param currentPrincipal - `DOMAIN\user` for the account Solo is running as
   * @returns a reason the ACL is untrusted, or `undefined` if every write grant is to a trusted principal
   */
  public static findUntrustedAceInIcaclsOutput(
    targetPath: string,
    output: string,
    currentPrincipal: string,
  ): string | undefined {
    for (const rawLine of output.split(/\r?\n/)) {
      const line: string = rawLine.trim();
      // Greedy up to the last colon, so a drive letter in the leading path does not split the line
      // early; the trailing parenthesised groups are the ACE rights.
      const parsed: RegExpMatchArray | null = /^(.*):((?:\([^)]*\))+)$/.exec(line);
      if (!parsed) {
        continue;
      }

      let principal: string = parsed[1].trim();
      if (principal.startsWith(targetPath)) {
        principal = principal.slice(targetPath.length).trim();
      }
      if (principal.length === 0) {
        continue;
      }

      const rights: string[] = [...parsed[2].matchAll(/\(([^)]*)\)/g)].flatMap((group: RegExpMatchArray): string[] =>
        group[1].split(',').map((right: string): string => right.trim().toUpperCase()),
      );

      // `(DENY)` marks a deny ACE, which grants nothing. Reading its rights as a grant would
      // reject a hardened installation for explicitly denying the very access being guarded
      // against — failing closed, but on exactly the configuration that is doing the right thing.
      // Safe to skip: icacls prints one ACE per line, so a separate allow entry for the same
      // principal is still evaluated on its own line.
      if (rights.includes('DENY')) {
        continue;
      }

      // `(IO)` marks an inherit-only ACE: it does not apply to this object, only to children
      // created later.
      if (rights.includes('IO')) {
        continue;
      }
      if (principal.toLowerCase() === currentPrincipal.toLowerCase()) {
        continue;
      }
      if (
        FilePermissions.WINDOWS_TRUSTED_PRINCIPAL_PATTERNS.some((pattern: RegExp): boolean => pattern.test(principal))
      ) {
        continue;
      }
      const grantedWrite: string | undefined = rights.find((right: string): boolean =>
        FilePermissions.WINDOWS_WRITE_RIGHTS.includes(right),
      );
      if (grantedWrite) {
        return `its access control list grants '${grantedWrite}' to '${principal}'`;
      }
    }

    return undefined;
  }

  /** `DOMAIN\user` (or bare username) for the account Solo is running as. */
  private static currentWindowsPrincipal(): string {
    const username: string = os.userInfo().username;
    const domain: string | undefined = process.env.USERDOMAIN;
    return domain ? `${domain}\\${username}` : username;
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
