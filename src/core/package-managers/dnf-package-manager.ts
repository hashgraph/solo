// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for RPM-based distributions that ship dnf (Fedora, RHEL, Rocky, AlmaLinux, ...).
 *
 * Dependencies keep their plain upstream names on purpose: EL8 ships a real `iptables` package and
 * has no `iptables-nft`, while on Fedora and EL9+ `iptables-nft` carries `Provides: iptables`, so
 * `dnf install iptables` resolves to the right package on every release. A hard-coded
 * `iptables` -> `iptables-nft` rewrite breaks EL8 (#5355) — do not reintroduce one.
 */
@injectable()
export class DnfPackageManager extends LinuxPackageManager {
  protected installCommand(dependencies: string[]): string[] {
    return ['dnf', 'install', '-y', ...dependencies];
  }

  protected uninstallCommand(dependencies: string[]): string[] {
    return ['dnf', 'remove', '-y', ...dependencies];
  }

  protected updateCommand(): string[] {
    return ['dnf', 'makecache'];
  }

  protected upgradeCommand(dependencies: string[]): string[] {
    return ['dnf', 'upgrade', '-y', ...dependencies];
  }

  protected versionCommand(): string[] {
    return ['dnf', '--version'];
  }
}
