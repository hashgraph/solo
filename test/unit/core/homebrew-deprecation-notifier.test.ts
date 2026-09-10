// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {HomebrewDeprecationNotifier} from '../../../src/core/homebrew-deprecation-notifier.js';
import {PACKAGE_NAME} from '../../../src/core/constants.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';

/** Where Homebrew installs the `solo` formula on Apple silicon. */
const HOMEBREW_ARM_PATH: string = '/opt/homebrew/Cellar/solo/0.83.0/libexec/lib/node_modules/@hiero-ledger/solo';

/** Where Homebrew installs the `solo` formula on Intel macOS. */
const HOMEBREW_INTEL_PATH: string = '/usr/local/Cellar/solo/0.83.0/libexec/lib/node_modules/@hiero-ledger/solo';

/** Where Linuxbrew installs the `solo` formula. */
const LINUXBREW_PATH: string =
  '/home/linuxbrew/.linuxbrew/Cellar/solo/0.83.0/libexec/lib/node_modules/@hiero-ledger/solo';

/** Where Homebrew installs a pinned `solo@<version>` formula. */
const HOMEBREW_VERSIONED_PATH: string =
  '/opt/homebrew/Cellar/solo@0.83.0/0.83.0/libexec/lib/node_modules/@hiero-ledger/solo';

/** A global npm install whose prefix happens to be the Homebrew prefix — not a Homebrew install. */
const NPM_UNDER_HOMEBREW_PREFIX_PATH: string = '/opt/homebrew/lib/node_modules/@hiero-ledger/solo';

/** A plain global npm install. */
const NPM_PATH: string = '/usr/local/lib/node_modules/@hiero-ledger/solo';

/** A development checkout. */
const CHECKOUT_PATH: string = '/Users/someone/Documents/GitHub/solo';

/** Minimal logger surface exercised by the notifier. */
interface FakeLogger {
  showUser: SinonStub;
  debug: SinonStub;
}

/** Makes the installation look like it came from Homebrew, regardless of where the tests run. */
function stubHomebrewInstall(installedViaHomebrew: boolean): void {
  sinon.stub(HomebrewDeprecationNotifier, 'isInstalledViaHomebrew').returns(installedViaHomebrew);
}

describe('HomebrewDeprecationNotifier', (): void => {
  let logger: FakeLogger;
  let originalIsTty: boolean;

  beforeEach((): void => {
    originalIsTty = process.stdout.isTTY;
    process.stdout.isTTY = true;
    logger = {showUser: sinon.stub(), debug: sinon.stub()};
  });

  afterEach((): void => {
    process.stdout.isTTY = originalIsTty;
    sinon.restore();
  });

  /** Concatenates every argument passed to logger.showUser into a single searchable string. */
  function bannerText(): string {
    return logger.showUser
      .getCalls()
      .map((call): string => call.args.join(' '))
      .join('\n');
  }

  function notify(): void {
    HomebrewDeprecationNotifier.notifyIfInstalledViaHomebrew(logger as unknown as SoloLogger);
  }

  it('detects Homebrew installations across prefixes and versioned formulas', (): void => {
    for (const installationPath of [HOMEBREW_ARM_PATH, HOMEBREW_INTEL_PATH, LINUXBREW_PATH, HOMEBREW_VERSIONED_PATH]) {
      expect(HomebrewDeprecationNotifier.isInstalledViaHomebrew(installationPath), installationPath).to.be.true;
    }
  });

  it('does not treat npm installations as Homebrew installations', (): void => {
    for (const installationPath of [NPM_UNDER_HOMEBREW_PREFIX_PATH, NPM_PATH, CHECKOUT_PATH]) {
      expect(HomebrewDeprecationNotifier.isInstalledViaHomebrew(installationPath), installationPath).to.be.false;
    }
  });

  it('shows the banner with the end-of-updates date and the npm install command', (): void => {
    stubHomebrewInstall(true);

    notify();

    const output: string = bannerText();
    expect(output).to.include('August 31, 2026');
    expect(output).to.include(`npm install -g ${PACKAGE_NAME}`);
    expect(output).to.include('https://solo.hiero.org/docs/simple-solo-setup/upgrading-solo/');
  });

  it('does not show the banner for a non-Homebrew installation', (): void => {
    stubHomebrewInstall(false);

    notify();

    expect(logger.showUser).to.not.have.been.called;
  });

  it('does nothing when the session is not a TTY', (): void => {
    stubHomebrewInstall(true);
    process.stdout.isTTY = false;

    notify();

    expect(logger.showUser).to.not.have.been.called;
  });

  it('never lets a detection failure reach the user', (): void => {
    sinon.stub(HomebrewDeprecationNotifier, 'isInstalledViaHomebrew').throws(new Error('detection failed'));

    expect(notify).to.not.throw();
    expect(logger.showUser).to.not.have.been.called;
    expect(logger.debug).to.have.been.called;
  });
});
