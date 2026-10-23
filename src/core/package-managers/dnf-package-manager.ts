// SPDX-License-Identifier: Apache-2.0

import {injectable} from 'tsyringe-neo';
import {LinuxPackageManager} from './linux-package-manager.js';

/**
 * Package manager for RPM-based distributions that ship dnf (Fedora, RHEL, Rocky, AlmaLinux, ...).
 */
@injectable()
export class DnfPackageManager extends LinuxPackageManager {
  private static readonly NETWORK_TIMEOUT_SECONDS: number = 20;
  private static readonly NETWORK_RETRY_COUNT: number = 1;
  private static readonly NETWORK_WAIT_BOUNDARY_OPTIONS: string[] = [
    `--setopt=timeout=${DnfPackageManager.NETWORK_TIMEOUT_SECONDS}`,
    `--setopt=retries=${DnfPackageManager.NETWORK_RETRY_COUNT}`,
  ];

  // On Fedora/RHEL 8+ there is no package literally named `iptables`; `iptables-nft` carries
  // `Provides: iptables`. Install it explicitly rather than relying on that provides-resolution.
  protected override resolveDependencies(dependencies: string[]): string[] {
    return dependencies.map((dependency: string): string => (dependency === 'iptables' ? 'iptables-nft' : dependency));
  }

  protected installCommand(dependencies: string[]): string[] {
    return ['dnf', ...DnfPackageManager.NETWORK_WAIT_BOUNDARY_OPTIONS, 'install', '-y', ...dependencies];
  }

  protected uninstallCommand(dependencies: string[]): string[] {
    return ['dnf', ...DnfPackageManager.NETWORK_WAIT_BOUNDARY_OPTIONS, 'remove', '-y', ...dependencies];
  }

  protected updateCommand(): string[] {
    return ['dnf', ...DnfPackageManager.NETWORK_WAIT_BOUNDARY_OPTIONS, 'makecache'];
  }

  protected upgradeCommand(dependencies: string[]): string[] {
    return ['dnf', ...DnfPackageManager.NETWORK_WAIT_BOUNDARY_OPTIONS, 'upgrade', '-y', ...dependencies];
  }

  protected versionCommand(): string[] {
    return ['dnf', '--version'];
  }
}
