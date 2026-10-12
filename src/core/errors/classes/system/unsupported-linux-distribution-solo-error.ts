// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when Solo cannot determine a supported native package manager for the current
 * Linux distribution, so it cannot automatically install system dependencies (git, iptables, podman).
 * Solo supports apt-get (Debian/Ubuntu), dnf (Fedora/RHEL), yum (RHEL 7/CentOS 7), zypper (openSUSE),
 * pacman (Arch) and apk (Alpine).
 */
export class UnsupportedLinuxDistributionSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  public constructor(distribution: string) {
    super({
      message:
        `Unsupported Linux distribution '${distribution || 'unknown'}': ` +
        'no supported package manager (apt-get, dnf, yum, zypper, pacman, apk) was found',
      code: ErrorCodeRegistry.UNSUPPORTED_LINUX_DISTRIBUTION,
      troubleshootingSteps:
        'Install one of the supported package managers (apt-get, dnf, yum, zypper, pacman, apk), or\n' +
        'Install Solo and its dependencies (podman, git, iptables) manually, then re-run the command',
    });
  }
}
