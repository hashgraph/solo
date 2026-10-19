// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import os from 'node:os';
import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import * as constants from '../../../src/core/constants.js';
import {Container} from '../../../src/core/dependency-injection/container-init.js';
import {SubprocessEnvironmentBootstrap} from '../../../src/core/subprocess-environment-bootstrap.js';
import {SubprocessEnvironment} from '../../../src/core/subprocess-environment.js';
import {SubprocessCommandProfile} from '../../../src/core/subprocess-command-profile.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {OperatingSystem} from '../../../src/business/utils/operating-system.js';

describe('SubprocessEnvironmentBootstrap', (): void => {
  let homeDirectory: string;
  const warnings: string[] = [];
  const temporaryKeys: string[] = [];

  const infoMessages: string[] = [];
  const fakeLogger: SoloLogger = {
    warn: (message: string): void => {
      warnings.push(message);
    },
    info: (message: string): void => {
      infoMessages.push(message);
    },
  } as unknown as SoloLogger;

  function setTemporaryEnvironmentVariable(name: string, value: string): void {
    temporaryKeys.push(name);
    process.env[name] = value;
  }

  function writeConfigFile(contents: string, mode: number = 0o600): void {
    const filePath: string = PathEx.join(homeDirectory, constants.DEFAULT_SOLO_CONFIG_FILE);
    fs.writeFileSync(filePath, contents);
    fs.chmodSync(filePath, mode);
  }

  /** Runs the bootstrap and returns the error it threw, or undefined if it succeeded. */
  async function captureBootstrapError(): Promise<Error | undefined> {
    try {
      await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, homeDirectory);
      return undefined;
    } catch (error) {
      return error as Error;
    }
  }

  beforeEach((): void => {
    Container.getInstance().init();
    homeDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'solo-subprocess-config-'));
    fs.chmodSync(homeDirectory, 0o700);
    warnings.length = 0;
    infoMessages.length = 0;
    SubprocessEnvironment.resetWithheldReporting();
    SubprocessEnvironment.configureOperatorAllowlist({});
  });

  afterEach((): void => {
    fs.rmSync(homeDirectory, {recursive: true, force: true});
    for (const key of temporaryKeys) {
      delete process.env[key];
    }
    temporaryKeys.length = 0;
    SubprocessEnvironment.configureOperatorAllowlist({});
  });

  it('forwards a variable declared in the config file to the command it was declared for', async (): Promise<void> => {
    setTemporaryEnvironmentVariable('MY_PLATFORM_SETTING', 'from-the-operator');
    writeConfigFile(
      ['subprocess:', '  additionalEnvironmentVariables:', '    helm:', '      - MY_PLATFORM_SETTING', ''].join('\n'),
    );

    await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, homeDirectory);

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM).MY_PLATFORM_SETTING).to.equal(
      'from-the-operator',
    );
    // Per-command containment survives the round trip through the config file.
    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.NPM)).to.not.have.property('MY_PLATFORM_SETTING');
  });

  it('refuses a config-file entry on the never-passthrough list and warns about it', async (): Promise<void> => {
    setTemporaryEnvironmentVariable('AWS_ENDPOINT_URL_STS', 'https://attacker.example');
    setTemporaryEnvironmentVariable('LD_PRELOAD', '/tmp/evil.so');
    writeConfigFile(
      [
        'subprocess:',
        '  additionalEnvironmentVariables:',
        '    kubectl:',
        '      - AWS_ENDPOINT_URL_STS',
        '      - LD_PRELOAD',
        '',
      ].join('\n'),
    );

    await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, homeDirectory);

    const environment: Record<string, string> = SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);
    expect(environment).to.not.have.property('AWS_ENDPOINT_URL_STS');
    expect(environment).to.not.have.property('LD_PRELOAD');
    expect(warnings.join(' '), 'refusal must not be silent').to.include('AWS_ENDPOINT_URL_STS');
  });

  it('does not use the legacy solo.yaml name, which external tooling deletes', (): void => {
    // hiero-consensus-node's CITR Taskfile removes ~/.solo/solo.yaml, and older Solo versions
    // wrote a different `flags:` structure there. Reusing the name would silently wipe or
    // misparse an operator's settings.
    expect(constants.DEFAULT_SOLO_CONFIG_FILE).to.not.equal('solo.yaml');
  });

  it('ignores a stale legacy solo.yaml sitting alongside the config file', async (): Promise<void> => {
    setTemporaryEnvironmentVariable('MY_PLATFORM_SETTING', 'from-the-operator');
    fs.writeFileSync(PathEx.join(homeDirectory, 'solo.yaml'), ['flags:', '  node-ids: node1,node2', ''].join('\n'));
    writeConfigFile(
      ['subprocess:', '  additionalEnvironmentVariables:', '    helm:', '      - MY_PLATFORM_SETTING', ''].join('\n'),
    );

    await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, homeDirectory);

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM).MY_PLATFORM_SETTING).to.equal(
      'from-the-operator',
    );
  });

  it('reports malformed YAML instead of silently ignoring the file', async (): Promise<void> => {
    // Silently continuing would leave the operator believing passthrough was configured.
    writeConfigFile('subprocess:\n  additionalEnvironmentVariables:\n    helm: [unclosed\n');

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/Failed to read the Solo config file/);
  });

  it('reports an unreadable config file instead of silently ignoring it', async (): Promise<void> => {
    if (OperatingSystem.isWin32()) {
      return; // chmod does not make a file unreadable on Windows, where ACLs govern access
    }
    if (process.getuid?.() === 0) {
      return; // root bypasses mode bits, so the unreadable case cannot be exercised
    }
    writeConfigFile('subprocess: {}\n', 0o200);

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/Failed to read the Solo config file/);
  });

  it('refuses a group-writable config file rather than trusting it', async (): Promise<void> => {
    if (OperatingSystem.isWin32()) {
      return; // POSIX mode bits do not apply
    }
    writeConfigFile(
      ['subprocess:', '  additionalEnvironmentVariables:', '    helm:', '      - MY_PLATFORM_SETTING', ''].join('\n'),
      0o660,
    );

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/writable by group or other users/);
  });

  it('refuses a symlinked config file, whose target another user could swap', async (): Promise<void> => {
    if (OperatingSystem.isWin32()) {
      return; // symlink creation needs elevation on Windows
    }
    const target: string = PathEx.join(homeDirectory, 'elsewhere.yaml');
    fs.writeFileSync(target, 'subprocess: {}\n');
    fs.symlinkSync(target, PathEx.join(homeDirectory, constants.DEFAULT_SOLO_CONFIG_FILE));

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/symbolic link/);
  });

  it('refuses a trusted config file inside a group-writable directory', async (): Promise<void> => {
    if (OperatingSystem.isWin32()) {
      return; // POSIX mode bits do not apply
    }
    writeConfigFile('subprocess: {}\n');
    fs.chmodSync(homeDirectory, 0o770);

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/writable by group or other users/);
  });

  it('refuses when an ancestor of a custom SOLO_HOME is group-writable', async (): Promise<void> => {
    if (OperatingSystem.isWin32()) {
      return; // POSIX mode bits do not apply
    }
    // A writable grandparent lets an attacker replace the whole directory between the check and
    // the read, so checking only the file and its parent is not enough.
    const nestedHome: string = PathEx.join(homeDirectory, 'nested');
    fs.mkdirSync(nestedHome);
    fs.chmodSync(nestedHome, 0o700);
    fs.writeFileSync(PathEx.join(nestedHome, constants.DEFAULT_SOLO_CONFIG_FILE), 'subprocess: {}\n');
    fs.chmodSync(PathEx.join(nestedHome, constants.DEFAULT_SOLO_CONFIG_FILE), 0o600);
    fs.chmodSync(homeDirectory, 0o770);

    let thrown: Error | undefined;
    try {
      await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, nestedHome);
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown, 'bootstrap should have thrown').to.exist;
    expect(thrown.message).to.match(/untrusted/);
  });

  it('rejects a bare string where a list of variable names is expected', async (): Promise<void> => {
    // Valid YAML, wrong shape: iterating a string yields single characters, which would quietly
    // allowlist 'M', 'Y', '_' and so on.
    writeConfigFile(['subprocess:', '  additionalEnvironmentVariables:', '    helm: MY_VARIABLE', ''].join('\n'));

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/must be a list of variable names/);
    expect(error.message).to.include('helm');
  });

  it('rejects a mapping where a list of variable names is expected', async (): Promise<void> => {
    writeConfigFile(
      ['subprocess:', '  additionalEnvironmentVariables:', '    kubectl:', '      name: MY_VARIABLE', ''].join('\n'),
    );

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/must be a list of variable names/);
  });

  it('rejects a list entry that is not a string', async (): Promise<void> => {
    // A raw TypeError from outside the registered-error path would give the operator no code and
    // no troubleshooting steps.
    writeConfigFile(['subprocess:', '  additionalEnvironmentVariables:', '    helm:', '      - 42', ''].join('\n'));

    const error: Error | undefined = await captureBootstrapError();
    expect(error, 'bootstrap should have thrown').to.exist;
    expect(error.message).to.match(/only variable names/);
    expect(error.message).to.include('number');
  });

  it('installs a withheld-variable reporter covering every spawn, not just helm', async (): Promise<void> => {
    // Previously the diagnostic was a per-call callback wired into two of nine call sites, so
    // direct kubectl spawns filtered the environment with no log line at all.
    setTemporaryEnvironmentVariable('MY_UNLISTED_VARIABLE', 'value');
    writeConfigFile('subprocess: {}\n');

    await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, homeDirectory);
    SubprocessEnvironment.forCommand(SubprocessCommandProfile.KUBECTL);

    const reported: string = infoMessages.join('\n');
    expect(reported, 'kubectl spawns must report withheld names').to.include("withheld from 'kubectl'");
    expect(reported).to.include('MY_UNLISTED_VARIABLE');
    expect(reported, 'names only, never values').to.not.include('value=');
  });

  it('is a no-op when no config file exists, which is the common case', async (): Promise<void> => {
    setTemporaryEnvironmentVariable('MY_PLATFORM_SETTING', 'value');

    await SubprocessEnvironmentBootstrap.configureFromUserConfig(fakeLogger, homeDirectory);

    expect(SubprocessEnvironment.forCommand(SubprocessCommandProfile.HELM)).to.not.have.property('MY_PLATFORM_SETTING');
    expect(warnings).to.be.empty;
  });
});
