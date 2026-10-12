// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it, beforeEach, afterEach} from 'mocha';
import each from 'mocha-each';
import sinon, {type SinonStub} from 'sinon';
import {Flags as flags} from '../../../src/commands/flags.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type ConfigMap} from '../../../src/integration/kube/resources/config-map/config-map.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import yaml from 'yaml';
import {container} from 'tsyringe-neo';
import {resetTestContainer} from '../../test-container.js';

import {
  Helpers,
  ipV4ToBase64,
  cloneArray,
  parseNodeAliases,
  resolveGossipFqdnRestricted,
  remoteConfigsToDeploymentsTable,
  parseGossipFqdnRestricted,
  readGossipFqdnRestrictedFromFile,
  createAndCopyBlockNodeJsonFileForConsensusNode,
} from '../../../src/core/helpers.js';
import * as constants from '../../../src/core/constants.js';
import {helmValuesHelper} from '../../../src/core/helm-values-helper.js';
import {ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {SoloErrors} from '../../../src/core/errors/solo-errors.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';

/** Builds a K8Factory whose default kubeconfig resolves a context to the given cluster entry names. */
function stubK8FactoryWithClusterEntries(clusterEntriesByContext: Record<string, string>): K8Factory {
  return {
    default: (): unknown => ({
      contexts: (): unknown => ({
        readClusterOfContext: (context: string): string => clusterEntriesByContext[context] ?? '',
      }),
    }),
  } as unknown as K8Factory;
}

function makeConsensusNode(name: NodeAlias, nodeId: number): ConsensusNode {
  return new ConsensusNode(
    name,
    nodeId,
    'solo',
    'cluster',
    'ctx',
    'cluster.local',
    'network-{0}-svc',
    'network-node1-svc.solo.svc.cluster.local',
    [],
    [],
  );
}

function generateAndParse(
  nodes: ConsensusNode[],
  options: Parameters<typeof helmValuesHelper.generateExtraEnvironmentValuesFile>[1],
): {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}; blockNodesJson?: string}[]}} {
  const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-gen-env-'));
  try {
    const filePath: string = helmValuesHelper.generateExtraEnvironmentValuesFile(nodes, options, temporaryDirectory);
    const content: string = fs.readFileSync(filePath, 'utf8');
    return yaml.parse(content) as {
      hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}; blockNodesJson?: string}[]};
    };
  } finally {
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  }
}

describe('Helpers', (): void => {
  each([
    {input: '', output: []},
    {input: 'node1', output: ['node1']},
    {input: 'node1,node3', output: ['node1', 'node3']},
  ]).it('should parse node aliases for input', ({input, output}: {input: string; output: string[]}): void => {
    expect(parseNodeAliases(input)).to.deep.equal(output);
  });

  each([
    {input: [], output: []},
    {input: [1, 2, 3], output: [1, 2, 3]},
    {input: ['a', '2', '3'], output: ['a', '2', '3']},
  ]).it('should clone array for input', ({input, output}: {input: number[]; output: number[]}): void => {
    const clonedArray: number[] = cloneArray(input);
    expect(clonedArray).to.deep.equal(output);
    expect(clonedArray).not.to.equal(input); // ensure cloning creates a new array
  });

  it('Should parse argv to args with boolean flag correctly', (): void => {
    const argv: {[p: string]: boolean} = {[flags.quiet.name]: true};
    const result: string = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.quiet.name}`);
  });

  it('Should parse argv to args with flag correctly', (): void => {
    const argv: {[p: string]: string} = {[flags.namespace.name]: 'VALUE'};
    const result: string = flags.stringifyArgv(argv);
    expect(result).to.equal(`--${flags.namespace.name} VALUE`);
  });

  it('Should ipv4ToByteArray convert IPv4 address to string', (): void => {
    const ipV4Address: string = '192.168.0.1';
    const byteString: string = ipV4ToBase64(ipV4Address);
    expect(byteString).to.equal('wKgAAQ==');
  });

  describe('resolveBlockStreamModeForConsensusVersion', (): void => {
    it('defaults to BOTH for pre-0.74 consensus versions when no existing mode is present', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion(undefined, 'v0.73.0')).to.equal('BOTH');
    });

    it('defaults to RECORDS for 0.74+ consensus versions when no block node is deployed', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion(undefined, 'v0.74.0')).to.equal('RECORDS');
    });

    it('defaults to BLOCKS for 0.74+ consensus versions when a block node is deployed', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion(undefined, 'v0.74.0', true)).to.equal('BLOCKS');
    });

    it('defaults to RECORDS for 0.74+ consensus versions when TSS is disabled', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion(undefined, 'v0.74.0', true, false, false)).to.equal(
        'RECORDS',
      );
    });

    it('preserves BOTH during pre-0.74 upgrades when a block node is deployed', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BOTH', 'v0.73.0', true)).to.equal('BOTH');
    });

    it('switches BOTH to BLOCKS during 0.74+ upgrades when a block node is deployed', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BOTH', 'v0.74.0', true)).to.equal('BLOCKS');
    });

    it('preserves BOTH during 0.74+ WRB/RSA upgrades when a block node is deployed', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BOTH', 'v0.75.0', true, true)).to.equal('BOTH');
    });

    it('preserves BOTH during upgrades to 0.74+ when no block node is deployed', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BOTH', 'v0.74.0')).to.equal('BOTH');
    });

    it('preserves BLOCKS during later maintenance operations when block node integration is active', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BLOCKS', 'v0.74.0', true)).to.equal('BLOCKS');
    });

    it('does not preserve RECORDS when block node integration is active', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('RECORDS', 'v0.74.0', true)).to.equal('BLOCKS');
    });

    it('does not preserve BLOCKS when TSS is disabled', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BLOCKS', 'v0.74.0', true, false, false)).to.equal(
        'RECORDS',
      );
    });

    it('does not preserve BLOCKS when block node integration is inactive', (): void => {
      expect(Helpers.resolveBlockStreamModeForConsensusVersion('BLOCKS', 'v0.74.0')).to.equal('RECORDS');
    });
  });

  describe('updateBlockStreamPropertiesForMode', (): void => {
    it('sets wrappedRecordBlocks=false in BLOCKS mode when not explicitly enabled', (): void => {
      const lines: string[] = [
        'blockStream.streamMode=RECORDS',
        'blockStream.writerMode=FILE',
        'blockStream.streamMode=BOTH',
      ];

      Helpers.updateBlockStreamPropertiesForMode(lines, 'BLOCKS');

      expect(lines).to.deep.equal([
        'blockStream.streamMode=BLOCKS',
        'blockStream.writerMode=FILE_AND_GRPC',
        'blockStream.streamWrappedRecordBlocks=false',
      ]);
    });

    it('overrides wrappedRecordBlocks=true to false in BLOCKS mode', (): void => {
      const lines: string[] = [
        'blockStream.streamMode=RECORDS',
        'blockStream.writerMode=FILE',
        'blockStream.streamWrappedRecordBlocks=true',
        'blockStream.streamMode=BOTH',
      ];

      Helpers.updateBlockStreamPropertiesForMode(lines, 'BLOCKS');

      expect(lines).to.deep.equal([
        'blockStream.streamMode=BLOCKS',
        'blockStream.writerMode=FILE_AND_GRPC',
        'blockStream.streamWrappedRecordBlocks=false',
      ]);
    });

    it('keeps wrapped record block publishing enabled for BOTH mode', (): void => {
      const lines: string[] = ['blockStream.streamMode=BLOCKS', 'blockStream.streamWrappedRecordBlocks=false'];

      Helpers.updateBlockStreamPropertiesForMode(lines, 'BOTH');

      expect(lines).to.deep.equal([
        'blockStream.streamMode=BOTH',
        'blockStream.streamWrappedRecordBlocks=true',
        'blockStream.writerMode=FILE_AND_GRPC',
      ]);
    });

    it('disables wrapped record block publishing for BOTH mode when requested', (): void => {
      const lines: string[] = ['blockStream.streamMode=BOTH', 'blockStream.streamWrappedRecordBlocks=true'];

      Helpers.ensureWrappedRecordBlocksDisabled(lines, 'BOTH');

      expect(lines).to.deep.equal(['blockStream.streamMode=BOTH', 'blockStream.streamWrappedRecordBlocks=false']);
    });
  });

  describe('generateExtraEnvironmentValuesFile', (): void => {
    it('should preserve user-provided hedera.nodes root extraEnv entries when wraps injects TSS_LIB_WRAPS_ARTIFACTS_PATH', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const userValuesFilePath: string = path.join(temporaryDirectory, 'user-values.yaml');
      fs.writeFileSync(
        userValuesFilePath,
        [
          'hedera:',
          '  nodes:',
          '    - root:',
          '        extraEnv:',
          '          - name: USER_ENV',
          '            value: user-value',
        ].join('\n'),
        'utf8',
      );

      try {
        const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
          [node],
          {
            wrapsEnabled: true,
            tss: {
              wraps: {
                artifactsFolderName: 'data/keys/wraps-v1.0.0',
              },
            },
            baseExtraEnvironmentVariables: helmValuesHelper.extractExtraEnvironmentFromValuesFiles(
              [userValuesFilePath],
              [node],
            ),
          },
        );
        expect(result.hedera.nodes[0].root?.extraEnv).to.deep.equal([
          {name: 'USER_ENV', value: 'user-value'},
          {
            name: 'TSS_LIB_WRAPS_ARTIFACTS_PATH',
            value: `${constants.HEDERA_HAPI_PATH}/data/keys/wraps-v1.0.0`,
          },
        ]);
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });

    it('should sanitize -Xms/-Xmx from JAVA_OPTS coming from baseExtraEnvironmentVariables', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
        [node],
        {
          baseExtraEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms256m -Xmx2g -Dfoo=bar'}],
          },
        },
      );
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      expect(javaOptions).to.equal('-Dfoo=bar');
    });

    it('should sanitize -Xms/-Xmx from JAVA_OPTS after debug-node prepend adds base value with heap flags', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
        [node],
        {
          debugNodeAlias: 'node1',
          baseExtraEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms512m -Xmx4g -Dfoo=bar'}],
          },
        },
      );
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      // debug jdwp prefix should be present, heap flags should be gone
      expect(javaOptions).to.include('-agentlib:jdwp=');
      expect(javaOptions).to.not.include('-Xms');
      expect(javaOptions).to.not.include('-Xmx');
      expect(javaOptions).to.include('-Dfoo=bar');
    });

    it('should sanitize -Xms/-Xmx from JAVA_OPTS coming from additionalEnvironmentVariables', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {root?: {extraEnv: {name: string; value: string}[]}}[]}} = generateAndParse(
        [node],
        {
          additionalEnvironmentVariables: {
            node1: [{name: 'JAVA_OPTS', value: '-Xms128m -Xmx1g -Dbaz=qux'}],
          },
        },
      );
      const javaOptions: string | undefined = result.hedera.nodes[0].root?.extraEnv.find(
        (environmentEntry: {name: string; value: string}): boolean => environmentEntry.name === 'JAVA_OPTS',
      )?.value;
      expect(javaOptions).to.equal('-Dbaz=qux');
    });

    it('should preserve blockNodesJson from additionalNodeValues in the output structure', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const blockNodesJsonContent: string = JSON.stringify({blockNodes: [{host: 'localhost', port: 8080}]});
      const result: {hedera: {nodes: {blockNodesJson?: string}[]}} = generateAndParse([node], {
        additionalNodeValues: {
          node1: {name: 'node1', nodeId: 0, accountId: '0.0.3', blockNodesJson: blockNodesJsonContent},
        },
      });
      expect(result.hedera.nodes[0].blockNodesJson).to.equal(blockNodesJsonContent);
    });

    it('should not include blockNodesJson in output when not provided', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: {hedera: {nodes: {blockNodesJson?: string}[]}} = generateAndParse([node], {
        additionalNodeValues: {
          node1: {name: 'node1', nodeId: 0, accountId: '0.0.3'},
        },
      });
      expect(result.hedera.nodes[0].blockNodesJson).to.be.undefined;
    });
  });

  describe('describeUserProvidedExtraEnvironmentWarnings', (): void => {
    it('warns when Solo overwrites a user-provided extraEnv value during wraps merge', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const userValuesFilePath: string = path.join(temporaryDirectory, 'user-values.yaml');
      fs.writeFileSync(
        userValuesFilePath,
        [
          'hedera:',
          '  nodes:',
          '    - root:',
          '        extraEnv:',
          '          - name: TSS_LIB_WRAPS_ARTIFACTS_PATH',
          '            value: /user/path',
        ].join('\n'),
        'utf8',
      );

      try {
        const warnings: string[] = helmValuesHelper.describeUserProvidedExtraEnvironmentWarnings(
          [userValuesFilePath],
          [node],
          {
            wrapsEnabled: true,
            tss: {
              wraps: {
                artifactsFolderName: 'data/keys/wraps-v1.0.0',
              },
            },
          },
        );

        expect(warnings).to.deep.equal([
          `Warning: User-provided extraEnv TSS_LIB_WRAPS_ARTIFACTS_PATH for node1 was overwritten during Solo's generated extraEnv merge. Final value: ${constants.HEDERA_HAPI_PATH}/data/keys/wraps-v1.0.0`,
        ]);
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });

    it('warns when invalid or duplicate user-provided extraEnv entries are ignored', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const userValuesFilePath: string = path.join(temporaryDirectory, 'user-values.yaml');
      fs.writeFileSync(
        userValuesFilePath,
        [
          'hedera:',
          '  nodes:',
          '    - root:',
          '        extraEnv:',
          '          - name: DUPLICATE_ENV',
          '            value: first-value',
          '          - name: DUPLICATE_ENV',
          '            value: second-value',
          '          - name: INVALID_ENV',
        ].join('\n'),
        'utf8',
      );

      try {
        const warnings: string[] = helmValuesHelper.describeUserProvidedExtraEnvironmentWarnings(
          [userValuesFilePath],
          [node],
        );

        expect(warnings).to.deep.equal([
          'Warning: Ignored 1 invalid extraEnv entry from --values-file input because each entry must contain string name and value fields.',
          'Warning: User-provided extraEnv DUPLICATE_ENV for node1 is defined multiple times across --values-file inputs; the last value wins.',
        ]);
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });
  });

  describe('extractPerNodeBlockNodesJsonFromValuesFile', (): void => {
    it('should extract blockNodesJson per node from a YAML values file', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const blockNodesJsonContent: string = JSON.stringify({nodes: [{host: 'block-node', port: 8080}]});
      const valuesContent: string = [
        'hedera:',
        '  nodes:',
        '    - name: node1',
        '      nodeId: 0',
        `      blockNodesJson: '${blockNodesJsonContent}'`,
      ].join('\n');

      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const temporaryFile: string = path.join(temporaryDirectory, 'values.yaml');
      fs.writeFileSync(temporaryFile, valuesContent, 'utf8');
      try {
        const result: Record<NodeAlias, string> = helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(
          temporaryFile,
          [node],
        );
        expect(result['node1']).to.equal(blockNodesJsonContent);
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });

    it('should return empty record when file does not exist', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const result: Record<NodeAlias, string> = helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(
        '/nonexistent/file.yaml',
        [node],
      );
      expect(result).to.deep.equal({});
    });

    it('should return empty record when hedera.nodes is absent from the file', (): void => {
      const node: ConsensusNode = makeConsensusNode('node1', 0);
      const valuesContent: string = 'hedera:\n  configMaps:\n    settingsTxt: "foo"\n';
      const temporaryDirectory: string = fs.mkdtempSync(path.join(os.tmpdir(), 'test-helpers-'));
      const temporaryFile: string = path.join(temporaryDirectory, 'values.yaml');
      fs.writeFileSync(temporaryFile, valuesContent, 'utf8');
      try {
        const result: Record<NodeAlias, string> = helmValuesHelper.extractPerNodeBlockNodesJsonFromValuesFile(
          temporaryFile,
          [node],
        );
        expect(result).to.deep.equal({});
      } finally {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
    });
  });

  describe('remoteConfigsToDeploymentsTable', (): void => {
    it('should support clusters as an object map', (): void => {
      const remoteConfigs: ConfigMap[] = [
        {
          namespace: NamespaceName.of('default'),
          name: 'remote-config',
          data: {
            'remote-config-data': yaml.stringify({
              clusters: {
                clusterA: {deployment: 'deployment-a'},
              },
            }),
          },
        },
      ];

      const rows: string[] = remoteConfigsToDeploymentsTable(remoteConfigs);

      expect(rows).to.deep.equal(['Namespace : deployment', 'default : deployment-a']);
    });

    it('should return header only when clusters is missing', (): void => {
      const remoteConfigs: ConfigMap[] = [
        {
          namespace: NamespaceName.of('default'),
          name: 'remote-config',
          data: {
            'remote-config-data': yaml.stringify({}),
          },
        },
      ];

      const rows: string[] = remoteConfigsToDeploymentsTable(remoteConfigs);

      expect(rows).to.deep.equal(['Namespace : deployment']);
    });
  });

  describe('isKindContext', (): void => {
    it('recognizes a context kind wrote for one of its clusters', (): void => {
      expect(Helpers.isKindContext('kind-solo')).to.be.true;
      expect(Helpers.isKindContext('kind-solo-cluster')).to.be.true;
    });

    it('rejects a context that does not belong to a kind cluster', (): void => {
      expect(Helpers.isKindContext('gke_my-project_us-central1_my-cluster')).to.be.false;
      expect(Helpers.isKindContext('minikube')).to.be.false;
      expect(Helpers.isKindContext('a-kind-cluster')).to.be.false;
    });

    it('rejects a missing context', (): void => {
      const unresolvedContext: string = undefined;
      expect(Helpers.isKindContext(unresolvedContext)).to.be.false;
      expect(Helpers.isKindContext('')).to.be.false;
    });

    it('recognizes a renamed context through its kubeconfig cluster entry', (): void => {
      expect(Helpers.isKindContext('solo-renamed', stubK8FactoryWithClusterEntries({'solo-renamed': 'kind-solo'}))).to
        .be.true;
    });
  });

  describe('kindClusterNameForContext', (): void => {
    it('resolves the cluster name from a context kind wrote', (): void => {
      expect(Helpers.kindClusterNameForContext('kind-solo')).to.equal('solo');
      expect(Helpers.kindClusterNameForContext('kind-solo-cluster')).to.equal('solo-cluster');
    });

    it('resolves the cluster name of a renamed context through its kubeconfig cluster entry', (): void => {
      const k8Factory: K8Factory = stubK8FactoryWithClusterEntries({'solo-renamed': 'kind-solo'});
      expect(Helpers.kindClusterNameForContext('solo-renamed', k8Factory)).to.equal('solo');
    });

    it('returns undefined when neither the context nor its cluster entry is Kind-named', (): void => {
      const k8Factory: K8Factory = stubK8FactoryWithClusterEntries({'gke-prod': 'gke-prod-entry'});
      expect(Helpers.kindClusterNameForContext('gke-prod', k8Factory)).to.be.undefined;
      expect(Helpers.kindClusterNameForContext('gke-prod')).to.be.undefined;
      expect(Helpers.kindClusterNameForContext(undefined, k8Factory)).to.be.undefined;
    });

    it('returns undefined when the kubeconfig cluster entry cannot be read', (): void => {
      const k8Factory: K8Factory = {
        default: (): never => {
          throw new Error('kubeconfig unavailable');
        },
      } as unknown as K8Factory;
      expect(Helpers.kindClusterNameForContext('solo-renamed', k8Factory)).to.be.undefined;
    });
  });

  describe('parseGossipFqdnRestricted', (): void => {
    it('parses true value', (): void => {
      const content: string = 'nodes.gossipFqdnRestricted=true';
      expect(parseGossipFqdnRestricted(content)).to.equal(true);
    });

    it('parses false value', (): void => {
      const content: string = 'nodes.gossipFqdnRestricted=false';
      expect(parseGossipFqdnRestricted(content)).to.equal(false);
    });

    it('handles whitespace around equals sign', (): void => {
      const content: string = 'nodes.gossipFqdnRestricted  =  true';
      expect(parseGossipFqdnRestricted(content)).to.equal(true);
    });

    it('handles leading and trailing whitespace in value', (): void => {
      const content: string = 'nodes.gossipFqdnRestricted = false ';
      expect(parseGossipFqdnRestricted(content)).to.equal(false);
    });

    it('handles property in middle of file', (): void => {
      const content: string = `
# Configuration file
some.other.property=value
nodes.gossipFqdnRestricted=true
another.property=123
`;
      expect(parseGossipFqdnRestricted(content)).to.equal(true);
    });

    it('is case-sensitive for true value', (): void => {
      // The regex only matches lowercase "true" or "false"
      expect(parseGossipFqdnRestricted('nodes.gossipFqdnRestricted=TRUE')).to.be.undefined;
      expect(parseGossipFqdnRestricted('nodes.gossipFqdnRestricted=True')).to.be.undefined;
      expect(parseGossipFqdnRestricted('nodes.gossipFqdnRestricted=true')).to.equal(true);
    });

    it('is case-sensitive for false value', (): void => {
      // The regex only matches lowercase "true" or "false"
      expect(parseGossipFqdnRestricted('nodes.gossipFqdnRestricted=FALSE')).to.be.undefined;
      expect(parseGossipFqdnRestricted('nodes.gossipFqdnRestricted=False')).to.be.undefined;
      expect(parseGossipFqdnRestricted('nodes.gossipFqdnRestricted=false')).to.equal(false);
    });

    it('returns undefined for missing property', (): void => {
      const content: string = 'some.other.property=value\nanother.property=123';
      expect(parseGossipFqdnRestricted(content)).to.be.undefined;
    });

    it('returns undefined for empty string', (): void => {
      expect(parseGossipFqdnRestricted('')).to.be.undefined;
    });

    it('does not match similar property names', (): void => {
      const testCases: string[] = [
        'nodes.gossipFqdn=true', // Missing "Restricted"
        'nodes.gossipFqdnRestricted_=true', // Extra underscore
        'nodes.gossipFqdnRestrictedValue=true', // Different property name
        'myNodes.gossipFqdnRestricted=true', // Different prefix
      ];
      for (const content of testCases) {
        expect(parseGossipFqdnRestricted(content)).to.be.undefined;
      }
    });

    it('does not match invalid values', (): void => {
      const testCases: string[] = [
        'nodes.gossipFqdnRestricted=yes',
        'nodes.gossipFqdnRestricted=1',
        'nodes.gossipFqdnRestricted=FALSE_VALUE',
      ];
      for (const content of testCases) {
        expect(parseGossipFqdnRestricted(content)).to.be.undefined;
      }
    });

    it('matches property at beginning of file', (): void => {
      const content: string = 'nodes.gossipFqdnRestricted=true\nother.property=value';
      expect(parseGossipFqdnRestricted(content)).to.equal(true);
    });

    it('handles comments and other content', (): void => {
      const content: string = `# This is a comment
# nodes.gossipFqdnRestricted=false
nodes.gossipFqdnRestricted=true
# Another comment`;
      // Should match the non-commented line
      expect(parseGossipFqdnRestricted(content)).to.equal(true);
    });

    it('matches first occurrence only (multiline)', (): void => {
      const content: string = `nodes.gossipFqdnRestricted=true
nodes.gossipFqdnRestricted=false`;
      // Should return the first match
      expect(parseGossipFqdnRestricted(content)).to.equal(true);
    });
  });

  describe('parseNumericApplicationProperty', (): void => {
    it('parses the value of a numeric property', (): void => {
      const content: string = 'hedera.realm=3\nhedera.shard=2';
      expect(Helpers.parseNumericApplicationProperty(content, 'hedera.realm')).to.equal(3);
      expect(Helpers.parseNumericApplicationProperty(content, 'hedera.shard')).to.equal(2);
    });

    it('handles whitespace around the equals sign and value', (): void => {
      const content: string = 'hedera.realm  =  10 ';
      expect(Helpers.parseNumericApplicationProperty(content, 'hedera.realm')).to.equal(10);
    });

    it('returns undefined for a missing property', (): void => {
      const content: string = 'some.other.property=value';
      expect(Helpers.parseNumericApplicationProperty(content, 'hedera.realm')).to.be.undefined;
    });

    it('returns undefined for a non-numeric value', (): void => {
      const content: string = 'hedera.realm=abc';
      expect(Helpers.parseNumericApplicationProperty(content, 'hedera.realm')).to.be.undefined;
    });

    it('does not match a property whose key is a superstring of the requested key', (): void => {
      const content: string = 'hedera.realmNumber=7';
      expect(Helpers.parseNumericApplicationProperty(content, 'hedera.realm')).to.be.undefined;
    });
  });

  describe('readGossipFqdnRestrictedFromFile', (): void => {
    afterEach((): void => {
      sinon.restore();
    });

    it('returns undefined for non-existent file', (): void => {
      sinon.stub(fs, 'existsSync').returns(false);
      expect(readGossipFqdnRestrictedFromFile('/path/to/non/existent/file')).to.be.undefined;
    });

    it('reads and parses true value from file', (): void => {
      const existsSyncStub: SinonStub = sinon.stub(fs, 'existsSync').returns(true);
      const readFileSyncStub: SinonStub = sinon.stub(fs, 'readFileSync').returns('nodes.gossipFqdnRestricted=true');
      expect(readGossipFqdnRestrictedFromFile('/path/to/file')).to.equal(true);
      expect(existsSyncStub.called).to.be.true;
      expect(readFileSyncStub.called).to.be.true;
    });

    it('reads and parses false value from file', (): void => {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns('nodes.gossipFqdnRestricted=false\nother.property=value');
      expect(readGossipFqdnRestrictedFromFile('/path/to/file')).to.equal(false);
    });

    it('returns undefined when file exists but property is missing', (): void => {
      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns('some.other.property=value');
      expect(readGossipFqdnRestrictedFromFile('/path/to/file')).to.be.undefined;
    });
  });

  describe('resolveGossipFqdnRestricted', (): void => {
    afterEach((): void => {
      sinon.restore();
    });

    it('returns K8s configMap value when available', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<{data?: Record<string, string>}> => ({
            data: {
              [constants.APPLICATION_PROPERTIES]: 'nodes.gossipFqdnRestricted=false',
            },
          }),
        }),
      };
      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(false);
    });

    it('falls back to staging directory when K8s configMap is unavailable', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<never> => {
            throw new Error('ConfigMap not found');
          },
        }),
      };

      sinon.stub(fs, 'existsSync').callsFake((filePath: string | Buffer): boolean => {
        const filePathString: string = typeof filePath === 'string' ? filePath : filePath.toString();
        return filePathString.includes('/staging');
      });
      sinon.stub(fs, 'readFileSync').returns('nodes.gossipFqdnRestricted=true');

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(true);
    });

    it('falls back to cache directory when staging directory has no value', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<{data?: Record<string, string>}> => ({}),
        }),
      };

      sinon.stub(fs, 'existsSync').callsFake((filePath: string | Buffer): boolean => {
        const filePathString: string = (typeof filePath === 'string' ? filePath : filePath.toString()).replaceAll(
          '\\',
          '/',
        );
        return filePathString.includes('/cache');
      });
      sinon.stub(fs, 'readFileSync').returns('nodes.gossipFqdnRestricted=false');

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(false);
    });

    it('falls back to resources directory when cache is unavailable', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<{data?: Record<string, string>}> => ({}),
        }),
      };

      sinon.stub(fs, 'existsSync').callsFake((filePath: string | Buffer): boolean => {
        const filePathString: string = typeof filePath === 'string' ? filePath : filePath.toString();
        return filePathString.includes('/resources');
      });
      sinon.stub(fs, 'readFileSync').returns('nodes.gossipFqdnRestricted=true');

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(true);
    });

    it('returns default true when no source has value', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<{data?: Record<string, string>}> => ({}),
        }),
      };

      sinon.stub(fs, 'existsSync').returns(false);

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(true);
    });

    it('handles missing K8s client gracefully', async (): Promise<void> => {
      sinon.stub(fs, 'existsSync').returns(false);

      const result: boolean = await resolveGossipFqdnRestricted({
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(true);
    });

    it('handles missing namespace gracefully', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<never> => {
            throw new Error('Should not be called');
          },
        }),
      };

      sinon.stub(fs, 'existsSync').returns(false);

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        // No namespace provided
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      expect(result).to.equal(true);
    });

    it('prefers earlier sources over later sources', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<{data?: Record<string, string>}> => ({
            data: {
              [constants.APPLICATION_PROPERTIES]: 'nodes.gossipFqdnRestricted=false', // K8s has false
            },
          }),
        }),
      };

      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').returns('nodes.gossipFqdnRestricted=true'); // Staging/cache/repo have true

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      // Should prefer K8s value (false) over staging/cache/repo values (true)
      expect(result).to.equal(false);
    });

    it('ignores invalid property values in lower-priority sources', async (): Promise<void> => {
      const mockK8: {configMaps: () => {read: () => Promise<{data?: Record<string, string>}>}} = {
        configMaps: (): {read: () => Promise<{data?: Record<string, string>}>} => ({
          read: async (): Promise<{data?: Record<string, string>}> => ({}),
        }),
      };

      sinon.stub(fs, 'existsSync').returns(true);
      sinon.stub(fs, 'readFileSync').callsFake((filePath: string | Buffer): string => {
        const filePathString: string = typeof filePath === 'string' ? filePath : filePath.toString();
        if (filePathString.includes('/staging')) {
          return 'invalid.property=value'; // No gossipFqdnRestricted
        }
        return 'nodes.gossipFqdnRestricted=true'; // Cache/repo have valid value
      });

      const result: boolean = await resolveGossipFqdnRestricted({
        k8: mockK8 as unknown as K8,
        namespace: NamespaceName.of('solo'),
        stagingDir: '/staging',
        cacheDir: '/cache',
        resourcesDir: '/resources',
      });
      // Should skip staging (no value) and use cache value
      expect(result).to.equal(true);
    });
  });
});

describe('createAndCopyBlockNodeJsonFileForConsensusNode', (): void => {
  beforeEach((): void => {
    // Use the project's standard test-container reset so all baseline tokens
    // (LogLevel, DevelopmentMode, SoloLogger, etc.) are registered before our mocks.
    // Direct container.clearInstances() wipes those tokens and breaks subsequent tests.
    resetTestContainer();
    // Provide a minimal RemoteConfigRuntimeState so BlockNodesJsonWrapper can construct
    // without a live cluster. The state has no block nodes, which exercises the empty-nodes guard.
    container.registerInstance(InjectTokens.RemoteConfigRuntimeState, {
      configuration: {
        state: {
          blockNodes: [],
          externalBlockNodes: [],
          tssEnabled: false,
          blockNodeMessageSizeSoftLimitBytes: undefined,
          blockNodeMessageSizeHardLimitBytes: undefined,
        },
        clusters: [],
      },
    });
    container.registerInstance(InjectTokens.ConfigProvider, {
      config: (): {asObject: () => object} => ({asObject: (): object => ({})}),
    });
  });

  afterEach((): void => {
    sinon.restore();
    resetTestContainer();
  });

  it('throws BlockNodesJsonEmptySoloError when blockNodeMap is empty and allowEmpty is false', async (): Promise<void> => {
    const node: ConsensusNode = makeConsensusNode('node1' as NodeAlias, 1);
    await expect(
      createAndCopyBlockNodeJsonFileForConsensusNode(node, undefined as never, undefined as never, false),
    ).to.be.rejectedWith(SoloErrors.system.blockNodesJsonEmpty);
  });

  it('does not throw the empty-nodes guard when allowEmpty is true', async (): Promise<void> => {
    const node: ConsensusNode = makeConsensusNode('node1' as NodeAlias, 1);
    // Stub out filesystem calls that run after the guard passes.
    sinon.stub(fs, 'writeFileSync');
    sinon.stub(fs, 'existsSync').returns(false);
    // Stub logger so warn() doesn't throw when called with a null receiver.
    const stubLogger: {warn: () => void} = {warn: sinon.stub()};
    // With allowEmpty=true the guard is skipped; existsSync returns false so the
    // function returns early without touching K8, meaning no error is thrown.
    await expect(createAndCopyBlockNodeJsonFileForConsensusNode(node, stubLogger as never, undefined as never, true)).to
      .not.be.rejected;
  });
});
