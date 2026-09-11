// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import fs from 'node:fs';
import path from 'node:path';
import {type PackageManager} from './package-manager.js';
import {LinuxPackageManagerType} from './linux-package-manager-type.js';
import {BrewPackageManager} from './brew-package-manager.js';
import {AptGetPackageManager} from './apt-get-package-manager.js';
import {DnfPackageManager} from './dnf-package-manager.js';
import {YumPackageManager} from './yum-package-manager.js';
import {ZypperPackageManager} from './zypper-package-manager.js';
import {PacmanPackageManager} from './pacman-package-manager.js';
import {ApkPackageManager} from './apk-package-manager.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';
import {SoloErrors} from '../errors/solo-errors.js';
import {SubprocessEnvironment} from '../subprocess-environment.js';

/**
 * Selects the correct {@link PackageManager} for the host operating system and — on Linux — for the
 * specific distribution, so callers can install system dependencies without knowing which package
 * manager the user is running.
 */
@injectable()
export class OsPackageManager {
  /** Maps an os-release identifier (an `ID` or an `ID_LIKE` token) to the package manager it ships. */
  private static readonly DISTRIBUTION_PACKAGE_MANAGERS: Record<string, LinuxPackageManagerType> = {
    debian: LinuxPackageManagerType.APT_GET,
    ubuntu: LinuxPackageManagerType.APT_GET,
    fedora: LinuxPackageManagerType.DNF,
    rhel: LinuxPackageManagerType.DNF,
    centos: LinuxPackageManagerType.DNF,
    suse: LinuxPackageManagerType.ZYPPER,
    opensuse: LinuxPackageManagerType.ZYPPER,
    sles: LinuxPackageManagerType.ZYPPER,
    arch: LinuxPackageManagerType.PACMAN,
    alpine: LinuxPackageManagerType.APK,
  };

  /** Priority order used when falling back to probing which package-manager binary is installed. */
  private static readonly FALLBACK_PROBE_ORDER: LinuxPackageManagerType[] = [
    LinuxPackageManagerType.APT_GET,
    LinuxPackageManagerType.DNF,
    LinuxPackageManagerType.YUM,
    LinuxPackageManagerType.ZYPPER,
    LinuxPackageManagerType.PACMAN,
    LinuxPackageManagerType.APK,
  ];

  protected packageManager: PackageManager;

  public constructor() {
    if (OperatingSystem.isDarwin()) {
      this.packageManager = new BrewPackageManager();
    } else if (OperatingSystem.isWin32()) {
      // On Windows, Solo runs its Linux install flow inside WSL2 (Ubuntu), which uses apt-get.
      this.packageManager = new AptGetPackageManager();
    } else if (OperatingSystem.isLinux()) {
      this.packageManager = OsPackageManager.resolveLinuxPackageManager();
    } else {
      throw new Error(`Unsupported OS platform: ${OperatingSystem.getPlatform()}`);
    }
  }

  public getPackageManager(): PackageManager {
    return this.packageManager;
  }

  /** Resolves the package manager for the current Linux distribution via /etc/os-release, with a binary probe fallback. */
  private static resolveLinuxPackageManager(): PackageManager {
    const osRelease: {id: string; idLike: string[]} = OsPackageManager.readOsRelease();
    const candidates: string[] = [osRelease.id, ...osRelease.idLike].filter(Boolean);

    for (const candidate of candidates) {
      const type: LinuxPackageManagerType | undefined = OsPackageManager.DISTRIBUTION_PACKAGE_MANAGERS[candidate];
      // Trust the mapping only when its binary is actually installed: RHEL/CentOS <= 7 and
      // Amazon Linux 2 match the dnf entries via ID/ID_LIKE but ship only yum (#5355), so a
      // mapped-but-absent manager falls through to the binary probe below.
      if (type && OsPackageManager.isCommandAvailable(type)) {
        return OsPackageManager.createManagerByType(type);
      }
    }

    // os-release matched nothing (or the mapped manager is not installed); probe for an installed binary.
    for (const type of OsPackageManager.FALLBACK_PROBE_ORDER) {
      if (OsPackageManager.isCommandAvailable(type)) {
        return OsPackageManager.createManagerByType(type);
      }
    }

    throw new SoloErrors.system.unsupportedLinuxDistribution(osRelease.id);
  }

  /** Instantiates only the package manager matching the resolved distribution type. */
  private static createManagerByType(type: LinuxPackageManagerType): PackageManager {
    const factories: Record<LinuxPackageManagerType, () => PackageManager> = {
      [LinuxPackageManagerType.APT_GET]: (): PackageManager => new AptGetPackageManager(),
      [LinuxPackageManagerType.DNF]: (): PackageManager => new DnfPackageManager(),
      [LinuxPackageManagerType.YUM]: (): PackageManager => new YumPackageManager(),
      [LinuxPackageManagerType.ZYPPER]: (): PackageManager => new ZypperPackageManager(),
      [LinuxPackageManagerType.PACMAN]: (): PackageManager => new PacmanPackageManager(),
      [LinuxPackageManagerType.APK]: (): PackageManager => new ApkPackageManager(),
    };
    return factories[type]();
  }

  /** Reads and parses `ID` and `ID_LIKE` from `/etc/os-release`; returns empty values when unavailable. */
  private static readOsRelease(): {id: string; idLike: string[]} {
    try {
      const content: string = fs.readFileSync('/etc/os-release', 'utf8');
      let id: string = '';
      let idLike: string[] = [];
      for (const rawLine of content.split('\n')) {
        const line: string = rawLine.trim();
        if (line.startsWith('ID=')) {
          id = OsPackageManager.unquote(line.slice('ID='.length));
        } else if (line.startsWith('ID_LIKE=')) {
          idLike = OsPackageManager.unquote(line.slice('ID_LIKE='.length)).split(/\s+/).filter(Boolean);
        }
      }
      return {id, idLike};
    } catch {
      return {id: '', idLike: []};
    }
  }

  private static unquote(value: string): string {
    return value
      .trim()
      .replaceAll(/^["']|["']$/g, '')
      .toLowerCase();
  }

  /** Returns true if the given executable is found on the PATH (synchronous, no subprocess). */
  private static isCommandAvailable(command: string): boolean {
    const pathValue: string = SubprocessEnvironment.currentPath();
    return pathValue.split(path.delimiter).some((directory: string): boolean => {
      try {
        fs.accessSync(path.join(directory, command), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  }
}
