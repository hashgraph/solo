// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, describe, it} from 'mocha';
import sinon from 'sinon';
import yaml from 'yaml';
import {DefaultOneShotCommand} from '../../../src/commands/one-shot/default-one-shot.js';
import {FalconPrepareSpecLoader} from '../../../src/commands/one-shot/falcon-prepare-spec-loader.js';
import {type FalconPrepareSpec} from '../../../src/commands/one-shot/falcon-prepare-spec.js';
import {type FalconPrepareConfig} from '../../../src/commands/one-shot/falcon-prepare-config.js';
import {Flags} from '../../../src/commands/flags.js';
import {type CommandFlag} from '../../../src/types/flag-types.js';
import {negatedOptionFromFlag, optionFromFlag, soloCommand} from '../../../src/commands/command-helpers.js';
import {OneShotCommandDefinition} from '../../../src/commands/command-definitions/one-shot-command-definition.js';

function createDefaultConfig(overrides: Partial<FalconPrepareConfig> = {}): FalconPrepareConfig {
  return {
    numberOfConsensusNodes: 1,
    releaseTag: Flags.releaseTag.definition.defaultValue as string,
    mirrorNodeVersion: Flags.mirrorNodeVersion.definition.defaultValue as string,
    relayReleaseTag: Flags.relayReleaseTag.definition.defaultValue as string,
    chartVersion: Flags.blockNodeChartVersion.definition.defaultValue as string,
    explorerVersion: Flags.explorerVersion.definition.defaultValue as string,
    soloChartVersion: Flags.soloChartVersion.definition.defaultValue as string,
    loadBalancerEnabled: Flags.loadBalancerEnabled.definition.defaultValue as boolean,
    enableMirrorIngress: true,
    localBuildPath: Flags.localBuildPath.definition.defaultValue as string,
    debugNodeAlias: Flags.debugNodeAlias.definition.defaultValue as string,
    enableDevChartMode: false,
    forcePortForward: Flags.forcePortForward.definition.defaultValue as boolean,
    outputPath: Flags.outputValuesFile.definition.defaultValue as string,
    ...overrides,
  };
}

describe('DefaultOneShotCommand.generateFalconValuesYaml', (): void => {
  it('should generate valid YAML with all 7 sections', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, unknown> = yaml.parse(output);

    expect(parsed).to.have.property('network');
    expect(parsed).to.have.property('setup');
    expect(parsed).to.have.property('consensusNode');
    expect(parsed).to.have.property('mirrorNode');
    expect(parsed).to.have.property('relayNode');
    expect(parsed).to.have.property('blockNode');
    expect(parsed).to.have.property('explorerNode');
  });

  it('should use default versions from version.ts', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string>> = yaml.parse(output);

    function expectFlagValue(
      section: Record<string, string>,
      flag: CommandFlag,
      expected: string | number | boolean,
    ): void {
      expect(section[optionFromFlag(flag)], `${optionFromFlag(flag)} in section`).to.equal(expected);
    }

    expectFlagValue(parsed.network, Flags.releaseTag, Flags.releaseTag.definition.defaultValue);
    expectFlagValue(parsed.setup, Flags.releaseTag, Flags.releaseTag.definition.defaultValue);
    expectFlagValue(parsed.mirrorNode, Flags.mirrorNodeVersion, Flags.mirrorNodeVersion.definition.defaultValue);
    expectFlagValue(parsed.relayNode, Flags.relayReleaseTag, Flags.relayReleaseTag.definition.defaultValue);
    expectFlagValue(parsed.blockNode, Flags.blockNodeChartVersion, Flags.blockNodeChartVersion.definition.defaultValue);
    expectFlagValue(parsed.explorerNode, Flags.explorerVersion, Flags.explorerVersion.definition.defaultValue);
    expectFlagValue(parsed.network, Flags.soloChartVersion, Flags.soloChartVersion.definition.defaultValue);
    expectFlagValue(parsed.explorerNode, Flags.soloChartVersion, Flags.soloChartVersion.definition.defaultValue);
  });

  it('should apply user-provided version overrides', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({
      releaseTag: 'v0.99.0',
      mirrorNodeVersion: 'v0.200.0',
      relayReleaseTag: '0.50.0',
    });
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string>> = yaml.parse(output);

    expect(parsed.network[optionFromFlag(Flags.releaseTag)]).to.equal('v0.99.0');
    expect(parsed.setup[optionFromFlag(Flags.releaseTag)]).to.equal('v0.99.0');
    expect(parsed.mirrorNode[optionFromFlag(Flags.mirrorNodeVersion)]).to.equal('v0.200.0');
    expect(parsed.relayNode[optionFromFlag(Flags.relayReleaseTag)]).to.equal('0.50.0');
  });

  it('should apply mirror ingress setting', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({enableMirrorIngress: false});
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, boolean>> = yaml.parse(output);

    expect(parsed.mirrorNode[optionFromFlag(Flags.enableIngress)]).to.equal(false);
  });

  it('should use hardcoded defaults for non-prompted fields', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(output);

    expect(parsed.explorerNode[optionFromFlag(Flags.enableIngress)]).to.equal(true);
    expect(parsed.explorerNode[optionFromFlag(Flags.domainName)]).to.equal('');
    expect(parsed.mirrorNode[optionFromFlag(Flags.domainName)]).to.equal('');
    expect(parsed.network[optionFromFlag(Flags.storageType)]).to.equal('');
    expect(parsed.mirrorNode[optionFromFlag(Flags.storageType)]).to.equal('');
  });

  it('should apply developer options', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({
      enableDevChartMode: true,
      localBuildPath: '/path/to/build',
      debugNodeAlias: 'node1',
    });
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(output);

    expect(parsed.setup[optionFromFlag(Flags.debugMode)]).to.equal(true);
    expect(parsed.setup[optionFromFlag(Flags.localBuildPath)]).to.equal('/path/to/build');
    expect(parsed.network[optionFromFlag(Flags.debugNodeAlias)]).to.equal('node1');
    expect(parsed.consensusNode[optionFromFlag(Flags.debugNodeAlias)]).to.equal('node1');
    expect(parsed.blockNode[optionFromFlag(Flags.debugMode)]).to.equal(true);
  });

  it('should apply port forwarding setting', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig({forcePortForward: false});
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);
    const parsed: Record<string, Record<string, boolean>> = yaml.parse(output);

    expect(parsed.consensusNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
    expect(parsed.mirrorNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
    expect(parsed.relayNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
    expect(parsed.explorerNode[optionFromFlag(Flags.forcePortForward)]).to.equal(false);
  });

  it('should include header comment with usage and component toggle hints', (): void => {
    const config: FalconPrepareConfig = createDefaultConfig();
    const output: string = DefaultOneShotCommand.generateFalconValuesYaml(config);

    expect(output).to.match(/^# One-Shot Falcon Deployment Configuration/);
    expect(output).to.include(soloCommand(OneShotCommandDefinition.FALCON_DEPLOY_COMMAND));
    expect(output).to.include(optionFromFlag(Flags.valuesFile));
    expect(output).to.include(negatedOptionFromFlag(Flags.deployMirrorNode));
    expect(output).to.include(negatedOptionFromFlag(Flags.deployExplorer));
    expect(output).to.include(negatedOptionFromFlag(Flags.deployRelay));
  });
});

function stubFalconSpec(spec: FalconPrepareSpec): void {
  sinon.stub(FalconPrepareSpecLoader, 'load').returns(spec);
}

describe('DefaultOneShotCommand falcon spec validation', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('throws on an unknown flagsFrom registry key', (): void => {
    stubFalconSpec({blockedFlags: [], sections: [{name: 'x', flagsFrom: 'bogus.list'}], prompts: []});
    expect((): string => DefaultOneShotCommand.generateFalconValuesYaml(createDefaultConfig())).to.throw(/bogus\.list/);
  });

  it('throws on an unknown flag name in overrides (guards the dev/debug class of typo)', (): void => {
    stubFalconSpec({
      blockedFlags: [],
      sections: [{name: 'setup', flagsFrom: 'node.setup', overrides: {dev: true}}],
      prompts: [],
    });
    expect((): string => DefaultOneShotCommand.generateFalconValuesYaml(createDefaultConfig())).to.throw(
      /Unknown flag 'dev' in overrides/,
    );
  });

  it('throws on an unknown flag name in extraKeys', (): void => {
    stubFalconSpec({
      blockedFlags: [],
      sections: [{name: 'setup', flagsFrom: 'node.setup', extraKeys: {'not-a-flag': 'x'}}],
      prompts: [],
    });
    expect((): string => DefaultOneShotCommand.generateFalconValuesYaml(createDefaultConfig())).to.throw(
      /Unknown flag 'not-a-flag' in extraKeys/,
    );
  });

  it('throws on an unknown ${config.<key>} reference', (): void => {
    stubFalconSpec({
      blockedFlags: [],
      sections: [{name: 'setup', flagsFrom: 'node.setup', overrides: {'local-build-path': '${config.nope}'}}],
      prompts: [],
    });
    expect((): string => DefaultOneShotCommand.generateFalconValuesYaml(createDefaultConfig())).to.throw(
      /Unknown config key 'nope'/,
    );
  });

  it('resolves ${config.<key>}, ${default}, and literal override values', (): void => {
    stubFalconSpec({
      blockedFlags: [],
      sections: [
        {name: 'setup', flagsFrom: 'node.setup', overrides: {'local-build-path': '${config.localBuildPath}'}},
        {
          name: 'consensusNode',
          flagsFrom: 'node.start',
          overrides: {'debug-node-alias': 'literal-alias', 'force-port-forward': '${default}'},
        },
      ],
      prompts: [],
    });
    const config: FalconPrepareConfig = createDefaultConfig({localBuildPath: '/my/build/path'});
    const parsed: Record<string, Record<string, string | boolean>> = yaml.parse(
      DefaultOneShotCommand.generateFalconValuesYaml(config),
    );

    // ${config.<key>} resolves to the wizard answer
    expect(parsed.setup[optionFromFlag(Flags.localBuildPath)]).to.equal('/my/build/path');
    // a literal passes through verbatim
    expect(parsed.consensusNode[optionFromFlag(Flags.debugNodeAlias)]).to.equal('literal-alias');
    // ${default} resolves to the flag's default value
    expect(parsed.consensusNode[optionFromFlag(Flags.forcePortForward)]).to.equal(
      Flags.forcePortForward.definition.defaultValue,
    );
  });
});
