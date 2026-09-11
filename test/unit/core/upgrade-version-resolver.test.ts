// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonStubbedInstance} from 'sinon';
import {afterEach, describe, it} from 'mocha';

import {UpgradeVersionResolver} from '../../../src/core/upgrade-version-resolver.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {ConfigManager} from '../../../src/core/config-manager.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';

describe('UpgradeVersionResolver.resolve', (): void => {
  const fallbackDefault: string = '0.159.0';

  it('should use the user-supplied version when provided, over remote config and default', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');

    const resolved: string = UpgradeVersionResolver.resolve('0.160.0', remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal('0.160.0');
  });

  it('should honor the user-supplied version even when it equals the built-in default', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');

    const resolved: string = UpgradeVersionResolver.resolve(fallbackDefault, remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });

  it('should use the remote config version when the user did not supply a version', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');

    const resolved: string = UpgradeVersionResolver.resolve(undefined, remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal('0.152.0');
  });

  it('should fall back to the default when the user did not supply a version and remote config is 0.0.0', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.0.0');

    const resolved: string = UpgradeVersionResolver.resolve(undefined, remoteConfigVersion, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });

  it('should fall back to the default when the user did not supply a version and remote config is undefined', (): void => {
    const resolved: string = UpgradeVersionResolver.resolve(undefined, undefined, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });

  it('should fall back to the default when the user did not supply a version and remote config is null', (): void => {
    // eslint-disable-next-line unicorn/no-null -- getComponentVersion callers annotate the return as nullable
    const resolved: string = UpgradeVersionResolver.resolve(undefined, null, fallbackDefault);

    expect(resolved).to.equal(fallbackDefault);
  });
});

describe('UpgradeVersionResolver.resolveFromFlags', (): void => {
  const fallbackDefault: string = '0.159.0';
  const sandbox: sinon.SinonSandbox = sinon.createSandbox();

  afterEach((): void => {
    sandbox.restore();
  });

  it('should use the flag value when the user supplied the single tracked flag', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');
    const configManager: SinonStubbedInstance<ConfigManager> = sandbox.createStubInstance(ConfigManager);
    configManager.wasFlagProvidedByUser.withArgs(flags.upgradeVersion).returns(true);

    const resolved: string = UpgradeVersionResolver.resolveFromFlags(
      configManager,
      [flags.upgradeVersion],
      '0.160.0',
      remoteConfigVersion,
      fallbackDefault,
    );

    expect(resolved).to.equal('0.160.0');
  });

  it('should fall back to remote config when the user did not supply any tracked flag', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');
    const configManager: SinonStubbedInstance<ConfigManager> = sandbox.createStubInstance(ConfigManager);
    configManager.wasFlagProvidedByUser.returns(false);

    const resolved: string = UpgradeVersionResolver.resolveFromFlags(
      configManager,
      [flags.upgradeVersion],
      '0.160.0',
      remoteConfigVersion,
      fallbackDefault,
    );

    expect(resolved).to.equal('0.152.0');
  });

  it('should use the flag value when the user supplied either of multiple tracked flags', (): void => {
    const remoteConfigVersion: SemanticVersion<string> = new SemanticVersion('0.152.0');
    const configManager: SinonStubbedInstance<ConfigManager> = sandbox.createStubInstance(ConfigManager);
    const versionFlags: CommandFlag[] = [flags.relayVersion, flags.upgradeVersion];
    configManager.wasFlagProvidedByUser.withArgs(flags.relayVersion).returns(false);
    configManager.wasFlagProvidedByUser.withArgs(flags.upgradeVersion).returns(true);

    const resolved: string = UpgradeVersionResolver.resolveFromFlags(
      configManager,
      versionFlags,
      '0.160.0',
      remoteConfigVersion,
      fallbackDefault,
    );

    expect(resolved).to.equal('0.160.0');
  });

  it('should fall back to the default when neither remote config nor a tracked flag is available', (): void => {
    const configManager: SinonStubbedInstance<ConfigManager> = sandbox.createStubInstance(ConfigManager);
    configManager.wasFlagProvidedByUser.returns(false);

    const resolved: string = UpgradeVersionResolver.resolveFromFlags(
      configManager,
      [flags.upgradeVersion],
      '0.160.0',
      undefined,
      fallbackDefault,
    );

    expect(resolved).to.equal(fallbackDefault);
  });
});
