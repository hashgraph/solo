// SPDX-License-Identifier: Apache-2.0

import 'sinon-chai';

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {container} from 'tsyringe-neo';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import fs from 'node:fs';

import {Container} from '../../../src/core/dependency-injection/container-init.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import * as constants from '../../../src/core/constants.js';
import {Middlewares} from '../../../src/core/middlewares.js';
import {type DeprecationRegistry} from '../../../src/core/deprecation-registry.js';
import {Flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {type ArgvStruct} from '../../../src/types/aliases.js';
import {FilePermissions} from '../../../src/business/utils/file-permissions.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';

function removeFlag(flag: CommandFlag): void {
  const index: number = Flags.allFlags.indexOf(flag);
  if (index !== -1) {
    Flags.allFlags.splice(index, 1);
  }
}

describe('Middlewares.warnDeprecatedFlags', (): void => {
  const temporaryFlag: CommandFlag = {
    constName: 'temporaryDeprecatedFlag',
    name: 'temporary-deprecated-flag',
    definition: {
      describe: 'a flag that exists only for this test',
      type: 'boolean',
      deprecated: {since: '0.84.0', removalIssue: 5181, replacement: '--replacement-flag'},
    },
    prompt: undefined,
  };

  // Deprecated only under the 'temporary scoped' command group — supported everywhere else.
  const scopedFlag: CommandFlag = {
    constName: 'temporaryScopedFlag',
    name: 'temporary-scoped-flag',
    definition: {
      describe: 'a flag that is deprecated for one command only',
      type: 'boolean',
      deprecated: {
        since: '0.84.0',
        removalIssue: 5181,
        replacement: '--scoped-replacement-flag',
        commands: ['temporary scoped'],
      },
    },
    prompt: undefined,
  };

  let middlewares: Middlewares;
  let consoleOutput: string[];
  let originalConsoleLog: (...data: unknown[]) => void;
  let originalArgv: string[];

  beforeEach((): void => {
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...data: unknown[]): void => {
      consoleOutput.push(data.map(String).join(' '));
    };

    originalArgv = process.argv;

    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
    middlewares = container.resolve<Middlewares>(InjectTokens.Middlewares);

    Flags.allFlags.push(temporaryFlag, scopedFlag);
  });

  afterEach((): void => {
    console.log = originalConsoleLog;
    process.argv = originalArgv;
    removeFlag(temporaryFlag);
    removeFlag(scopedFlag);
  });

  it('warns when a deprecated flag is supplied', (): void => {
    process.argv = ['node', 'solo', '--temporary-deprecated-flag'];

    middlewares.warnDeprecatedFlags()({_: []} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain('--temporary-deprecated-flag');
    expect(output).to.contain("Use '--replacement-flag' instead.");
  });

  it('warns when a flag deprecated for a single command is supplied to that command', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'scoped', '--temporary-scoped-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'scoped']} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain("'--temporary-scoped-flag' is deprecated for 'temporary scoped'");
    expect(output).to.contain("Use '--scoped-replacement-flag' instead.");
  });

  it('warns for an operation beneath the command the flag is deprecated for', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'scoped', 'create', '--temporary-scoped-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'scoped', 'create']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.contain(
      "'--temporary-scoped-flag' is deprecated for 'temporary scoped create'",
    );
  });

  it('does not warn when a scoped flag is supplied to a command it is not deprecated for', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'other', '--temporary-scoped-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'other']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.not.contain('--temporary-scoped-flag');
  });

  it('warns for an outright deprecated flag regardless of the command invoked', (): void => {
    process.argv = ['node', 'solo', 'temporary', 'other', '--temporary-deprecated-flag'];

    middlewares.warnDeprecatedFlags()({_: ['temporary', 'other']} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain("'--temporary-deprecated-flag' is deprecated since");
    // An outright deprecation is not tied to a command, so the message names no command scope.
    expect(output).to.not.contain('deprecated for');
  });

  it('does not warn when the deprecated flag is absent', (): void => {
    process.argv = ['node', 'solo', 'deployment', 'config', 'create'];

    middlewares.warnDeprecatedFlags()({_: []} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.not.contain('--temporary-deprecated-flag');
  });

  it('warns automatically when a deprecated command is invoked', (): void => {
    const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
    registry.registerCommand('temporary deprecated command', 'subcommand', {
      since: '0.84.0',
      removalIssue: 5181,
      replacement: 'temporary replacement command',
    });

    middlewares.warnDeprecatedCommands()({_: ['temporary', 'deprecated', 'command']} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain("'temporary deprecated command' is deprecated");
    expect(output).to.contain("Use 'temporary replacement command' instead.");
  });

  it('warns for operations beneath a deprecated command group', (): void => {
    const registry: DeprecationRegistry = container.resolve<DeprecationRegistry>(InjectTokens.DeprecationRegistry);
    registry.registerCommand('temporary group', 'command', {since: '0.84.0', removalIssue: 5181});

    middlewares.warnDeprecatedCommands()({_: ['temporary', 'group', 'list']} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.contain("'temporary group' is deprecated");
  });
});

describe('Middlewares.initSystemFiles', (): void => {
  type MiddlewaresStatics = {hasShownDevSystemFileLists: boolean};

  let middlewares: Middlewares;
  let consoleOutput: string[];
  let originalConsoleLog: (...data: unknown[]) => void;
  const sandbox: SinonSandbox = sinon.createSandbox();

  beforeEach((): void => {
    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...data: unknown[]): void => {
      consoleOutput.push(data.map(String).join(' '));
    };

    Container.getInstance().init(constants.SOLO_HOME_DIR, constants.SOLO_CACHE_DIR, constants.SOLO_LOG_LEVEL);
    middlewares = container.resolve<Middlewares>(InjectTokens.Middlewares);
    // Reset the static flag so tests are independent.
    (Middlewares as unknown as MiddlewaresStatics).hasShownDevSystemFileLists = false;
  });

  afterEach((): void => {
    console.log = originalConsoleLog;
    sandbox.restore();
    (Middlewares as unknown as MiddlewaresStatics).hasShownDevSystemFileLists = false;
  });

  it('creates missing directories when they do not exist', async (): Promise<void> => {
    // Nothing exists — every main directory must be created; template source dir is also absent
    // so the copy task exits early (no extra mkdirSync call for it).
    const mkdirSyncStub: SinonStub = sandbox.stub(fs, 'mkdirSync');
    sandbox.stub(fs, 'existsSync').returns(false);
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    sandbox.stub(localConfig, 'configFileExists').returns(true);

    await middlewares.initSystemFiles()({_: []} as unknown as ArgvStruct);

    expect(mkdirSyncStub.callCount).to.equal(4);
  });

  it('skips mkdirSync for directories that already exist', async (): Promise<void> => {
    // All paths exist — no directory needs creating; templates are copied but not re-created.
    const mkdirSyncStub: SinonStub = sandbox.stub(fs, 'mkdirSync');
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'cpSync');
    sandbox.stub(FilePermissions, 'restrictTreeToOwner');
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    sandbox.stub(localConfig, 'configFileExists').returns(true);

    await middlewares.initSystemFiles()({_: []} as unknown as ArgvStruct);

    expect(mkdirSyncStub.called).to.be.false;
  });

  it('skips local config creation when the config file already exists', async (): Promise<void> => {
    sandbox.stub(fs, 'existsSync').returns(false);
    sandbox.stub(fs, 'mkdirSync');
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    const configFileExistsStub: SinonStub = sandbox.stub(localConfig, 'configFileExists').returns(true);
    const loadStub: SinonStub = sandbox.stub(localConfig, 'load').resolves();

    await middlewares.initSystemFiles()({_: []} as unknown as ArgvStruct);

    expect(configFileExistsStub.called).to.be.true;
    expect(loadStub.called).to.be.false;
  });

  it('copies templates when the source directory exists', async (): Promise<void> => {
    // Source templates dir exists; main dirs and destination templates dir do not.
    sandbox
      .stub(fs, 'existsSync')
      .callsFake((pathLike: unknown): boolean => String(pathLike).startsWith(constants.RESOURCES_DIR as string));
    sandbox.stub(fs, 'mkdirSync');
    const cpSyncStub: SinonStub = sandbox.stub(fs, 'cpSync');
    sandbox.stub(FilePermissions, 'restrictTreeToOwner');
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    sandbox.stub(localConfig, 'configFileExists').returns(true);

    await middlewares.initSystemFiles()({_: []} as unknown as ArgvStruct);

    expect(cpSyncStub.called).to.be.true;
  });

  it('shows the grey note when a template directory is created for the first time', async (): Promise<void> => {
    // Source templates dir exists; destination does not — directoryCreated becomes true.
    sandbox
      .stub(fs, 'existsSync')
      .callsFake((pathLike: unknown): boolean => String(pathLike).startsWith(constants.RESOURCES_DIR as string));
    sandbox.stub(fs, 'mkdirSync');
    sandbox.stub(fs, 'cpSync');
    sandbox.stub(FilePermissions, 'restrictTreeToOwner');
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    sandbox.stub(localConfig, 'configFileExists').returns(true);

    await middlewares.initSystemFiles()({_: []} as unknown as ArgvStruct);

    const output: string = consoleOutput.join('\n');
    expect(output).to.contain('Note: solo stores various artifacts');
    expect(output).to.contain(constants.SOLO_HOME_DIR as string);
  });

  it('shows the Home Directories list when argv.debug is true', async (): Promise<void> => {
    // All paths exist — templates are copied without creating any new directory.
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'cpSync');
    sandbox.stub(FilePermissions, 'restrictTreeToOwner');
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    sandbox.stub(localConfig, 'configFileExists').returns(true);

    await middlewares.initSystemFiles()({_: [], debug: true} as unknown as ArgvStruct);

    expect(consoleOutput.join('\n')).to.contain('Home Directories');
  });

  it('shows the Home Directories list only once across multiple invocations', async (): Promise<void> => {
    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'cpSync');
    sandbox.stub(FilePermissions, 'restrictTreeToOwner');
    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    sandbox.stub(localConfig, 'configFileExists').returns(true);

    await middlewares.initSystemFiles()({_: [], debug: true} as unknown as ArgvStruct);
    const firstCount: number = consoleOutput.filter((line: string): boolean =>
      line.includes('Home Directories'),
    ).length;

    // Second invocation should not print the list again — hasShownDevSystemFileLists guards it.
    await middlewares.initSystemFiles()({_: [], debug: true} as unknown as ArgvStruct);
    const secondCount: number = consoleOutput.filter((line: string): boolean =>
      line.includes('Home Directories'),
    ).length;

    expect(firstCount).to.be.greaterThanOrEqual(1);
    expect(secondCount).to.equal(firstCount);
  });
});
