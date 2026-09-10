// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import {execFileSync} from 'node:child_process';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../../../test-container.js';
import {InjectTokens} from '../../../../../src/core/dependency-injection/inject-tokens.js';
import {OsPackageManager} from '../../../../../src/core/package-managers/os-package-manager.js';
import {type PackageManager} from '../../../../../src/core/package-managers/package-manager.js';

/**
 * Validates the real per-distribution install path introduced in #4773 by running an actual
 * native-package-manager install of `git` and `iptables` and asserting both binaries land on the
 * system. This mutates the host, so it only runs inside disposable CI distribution containers when
 * {@link SOLO_OS_INSTALL_VALIDATION} is set; every other run skips it.
 *
 * Tracked by hiero-ledger/solo#4888 (per-distro install validation epic).
 */
const SOLO_OS_INSTALL_VALIDATION: string = 'SOLO_OS_INSTALL_VALIDATION';
const PACKAGES_TO_INSTALL: string[] = ['git', 'iptables'];

/** Throws if the given executable cannot be resolved on the PATH (including the sbin directories). */
function assertExecutableInstalled(executable: string): void {
  execFileSync('sh', ['-c', `command -v ${executable}`], {stdio: 'pipe'});
}

// eslint-disable-next-line prefer-arrow-callback
describe('OsPackageManager real install validation', function (this: Mocha.Suite): void {
  before(function (this: Mocha.Context): void {
    if (process.env[SOLO_OS_INSTALL_VALIDATION] !== 'true') {
      // eslint-disable-next-line unicorn/no-this-outside-of-class
      this.skip();
    }
    resetForTest();
    // Force the Linux distribution-detection branch regardless of the host the harness runs on.
    container.register(InjectTokens.OsPlatform, {useValue: 'linux'});
  });

  it('installs git and iptables via the distribution package manager', async (): Promise<void> => {
    const packageManager: PackageManager = new OsPackageManager().getPackageManager();
    await packageManager.update();
    await packageManager.installPackages(PACKAGES_TO_INSTALL);

    for (const executable of PACKAGES_TO_INSTALL) {
      expect((): void => assertExecutableInstalled(executable), `${executable} should be installed`).to.not.throw();
    }
  });
}).timeout(300_000);
