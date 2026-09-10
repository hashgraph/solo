// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';

import fs from 'node:fs';
import * as yaml from 'yaml';
import {Flags as flags} from '../../../src/commands/flags.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {ProfileManager} from '../../../src/core/profile-manager.js';
import {getTemporaryDirectory, getTestCacheDirectory} from '../../test-utility.js';
import * as version from '../../../version.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {Templates} from '../../../src/core/templates.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ConsensusNode} from '../../../src/core/model/consensus-node.js';
// eslint-disable-next-line no-restricted-imports
import {KubeConfig} from '@kubernetes/client-node';
import sinon from 'sinon';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfig} from '../../../src/business/runtime-state/config/remote/remote-config.js';
import {type RemoteConfigRuntimeStateApi} from '../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type AnyObject, type NodeAlias, type NodeAliases} from '../../../src/types/aliases.js';
import * as constants from '../../../src/core/constants.js';
import {Address} from '../../../src/business/address/address.js';
import {SemanticVersion} from '../../../src/business/utils/semantic-version.js';
import {BlockNodeStateSchema} from '../../../src/data/schema/model/remote/state/block-node-state-schema.js';
import {ComponentStateMetadataSchema} from '../../../src/data/schema/model/remote/state/component-state-metadata-schema.js';
import {ClusterSchema} from '../../../src/data/schema/model/common/cluster-schema.js';
function invokeExtractSavedEndpoint(
  manager: ProfileManager,
  consensusNode: ConsensusNode,
  nodeSequence: number,
  gossipFqdnRestricted: boolean = false,
): Promise<Address | undefined> {
  const extractSavedEndpoint: (
    node: ConsensusNode,
    nodeSequence: number,
    gossipFqdnRestricted: boolean,
  ) => Promise<Address | undefined> = (
    manager as unknown as Record<
      string,
      (node: ConsensusNode, nodeSequence: number, gossipFqdnRestricted: boolean) => Promise<Address | undefined>
    >
  ).extractSavedEndpoint;
  return extractSavedEndpoint.call(manager, consensusNode, nodeSequence, gossipFqdnRestricted);
}

describe('ProfileManager', (): void => {
  let temporaryDirectory: string, configManager: ConfigManager, profileManager: ProfileManager, cacheDirectory: string;
  const namespace: NamespaceName = NamespaceName.of('test-namespace');
  const deploymentName: string = 'deployment';
  const kubeConfig: KubeConfig = new KubeConfig();
  kubeConfig.loadFromDefault();
  const currentClusterName: string = kubeConfig.getCurrentCluster()?.name ?? 'test-cluster';
  const consensusNodes: ConsensusNode[] = [
    {
      name: 'node1',
      nodeId: 1,
      namespace: namespace.name,
      cluster: currentClusterName,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node1-svc.test-namespace.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
    {
      name: 'node2',
      nodeId: 2,
      namespace: namespace.name,
      cluster: currentClusterName,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node2-svc.test-namespace.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
    {
      name: 'node3',
      nodeId: 3,
      namespace: namespace.name,
      cluster: currentClusterName,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node3-svc.test-namespace.svc.cluster.local',
      blockNodeMap: [],
      externalBlockNodeMap: [],
    },
  ];

  let stagingDirectory: string = '';

  before(async (): Promise<void> => {
    resetForTest(namespace.name);
    temporaryDirectory = getTemporaryDirectory();
    configManager = container.resolve(InjectTokens.ConfigManager);
    profileManager = new ProfileManager(undefined, undefined, temporaryDirectory);
    configManager.setFlag(flags.nodeAliasesUnparsed, 'node1,node2,node4');
    configManager.setFlag(flags.cacheDir, getTestCacheDirectory('ProfileManager'));
    configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION);
    cacheDirectory = configManager.getFlag<string>(flags.cacheDir) as string;
    configManager.setFlag(flags.apiPermissionProperties, flags.apiPermissionProperties.definition.defaultValue);
    configManager.setFlag(flags.applicationEnv, flags.applicationEnv.definition.defaultValue);
    configManager.setFlag(flags.applicationProperties, flags.applicationProperties.definition.defaultValue);
    configManager.setFlag(flags.bootstrapProperties, flags.bootstrapProperties.definition.defaultValue);
    configManager.setFlag(flags.log4j2Xml, flags.log4j2Xml.definition.defaultValue);
    configManager.setFlag(flags.settingTxt, flags.settingTxt.definition.defaultValue);
    stagingDirectory = Templates.renderStagingDir(
      configManager.getFlag(flags.cacheDir),
      configManager.getFlag(flags.releaseTag),
    );
    if (!fs.existsSync(stagingDirectory)) {
      fs.mkdirSync(stagingDirectory, {recursive: true});
    }

    // @ts-expect-error - TS2339: to mock
    profileManager.remoteConfig.getConsensusNodes = sinon.stub().returns(consensusNodes);

    // @ts-expect-error - TS2339: to mock
    profileManager.remoteConfig.configuration = {
      // @ts-expect-error - TS2339: to mock
      state: {},
      versions: {
        // @ts-expect-error - TS2339: to mock
        consensusNode: version.HEDERA_PLATFORM_VERSION,
      },
    };

    // @ts-expect-error - TS2339: to mock
    profileManager.updateApplicationPropertiesForBlockNode = sinon.stub();

    const localConfig: LocalConfigRuntimeState = container.resolve<LocalConfigRuntimeState>(
      InjectTokens.LocalConfigRuntimeState,
    );
    await localConfig.load();
  });

  after((): void => {
    fs.rmSync(temporaryDirectory, {recursive: true});
  });

  describe('determine chart values', (): void => {
    it('should determine Solo chart values', async (): Promise<void> => {
      configManager.setFlag(flags.namespace, 'test-namespace');

      const resources: string[] = ['templates'];
      for (const directoryName of resources) {
        const sourceDirectory: string = PathEx.joinWithRealPath(PathEx.join('resources'), directoryName);
        if (!fs.existsSync(sourceDirectory)) {
          continue;
        }

        const destinationDirectory: string = PathEx.resolve(PathEx.join(cacheDirectory, directoryName));
        if (!fs.existsSync(destinationDirectory)) {
          fs.mkdirSync(destinationDirectory, {recursive: true});
        }

        fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
      }

      const applicationPropertiesFile: string = PathEx.join(
        cacheDirectory,
        'templates',
        constants.APPLICATION_PROPERTIES,
      );
      const valuesFileMapping: Record<string, string> = await profileManager.prepareValuesForSoloChart(
        consensusNodes,
        deploymentName,
        applicationPropertiesFile,
      );
      const valuesFile: string = Object.values(valuesFileMapping)[0];

      expect(valuesFile).not.to.be.null;
      expect(fs.existsSync(valuesFile)).to.be.ok;

      // validate the yaml
      const valuesYaml: AnyObject = yaml.parse(fs.readFileSync(valuesFile, 'utf8')) as AnyObject;
      expect(valuesYaml.hedera.nodes.length).to.equal(3);
    });

    it('prepareValuesForSoloChart should set the value of a key to the contents of a file', async (): Promise<void> => {
      configManager.setFlag(flags.namespace, 'test-namespace');

      const file: string = PathEx.join(temporaryDirectory, 'application.env');
      const fileContents: string = '# row 1\n# row 2\n# row 3';
      fs.writeFileSync(file, fileContents);
      configManager.setFlag(flags.applicationEnv, file);
      const destinationFile: string = PathEx.join(stagingDirectory, 'templates', 'application.env');
      const applicationPropertiesFile: string = PathEx.join(
        stagingDirectory,
        'templates',
        constants.APPLICATION_PROPERTIES,
      );
      fs.cpSync(file, destinationFile, {force: true});
      const cachedValuesFileMapping: Record<string, string> = await profileManager.prepareValuesForSoloChart(
        consensusNodes,
        deploymentName,
        applicationPropertiesFile,
      );
      const cachedValuesFile: string = Object.values(cachedValuesFileMapping)[0];
      const valuesYaml: AnyObject = yaml.parse(fs.readFileSync(cachedValuesFile, 'utf8')) as AnyObject;
      expect(valuesYaml.hedera.configMaps.applicationEnv).to.equal(fileContents);
    });

    it('addBlockNodesJsonValues should use current remote config mappings when node input is stale', (): void => {
      const staleConsensusNodes: ConsensusNode[] = [
        {
          ...consensusNodes[0],
          blockNodeMap: [],
          externalBlockNodeMap: [],
        },
      ];
      const latestConsensusNodes: ConsensusNode[] = [
        {
          ...consensusNodes[0],
          blockNodeMap: [[1, 1]],
          externalBlockNodeMap: [],
        },
      ];
      const yamlRoot: AnyObject = {};

      const profileManagerPrivate: {
        remoteConfig: RemoteConfigRuntimeStateApi;
      } = profileManager as unknown as {
        remoteConfig: RemoteConfigRuntimeStateApi;
      };
      const configurationStub: sinon.SinonStub = sinon.stub(profileManagerPrivate.remoteConfig, 'configuration').get(
        (): RemoteConfig =>
          ({
            clusters: [new ClusterSchema(currentClusterName, namespace.name, deploymentName)],
            state: {
              blockNodes: [
                new BlockNodeStateSchema(new ComponentStateMetadataSchema(1, namespace.name, currentClusterName)),
              ],
              externalBlockNodes: [],
              tssEnabled: false,
            },
            versions: {
              consensusNode: version.HEDERA_PLATFORM_VERSION,
            },
          }) as unknown as RemoteConfig,
      );

      try {
        // @ts-expect-error - TS2339: to mock
        profileManager.remoteConfig.getConsensusNodes = sinon.stub().returns(latestConsensusNodes);

        profileManager.addBlockNodesJsonValues(staleConsensusNodes, ['node1'], deploymentName, yamlRoot);

        const blockNodesJson: {
          nodes: {address: string; priority: number; servicePort: number; streamingPort: number}[];
        } = JSON.parse(yamlRoot.hedera.nodes[0].blockNodesJson) as {
          nodes: {address: string; priority: number; servicePort: number; streamingPort: number}[];
        };

        expect(blockNodesJson.nodes).to.have.lengthOf(1);
        expect(blockNodesJson.nodes[0].address).to.equal(`block-node-1.${namespace.name}.svc.cluster.local`);
        expect(blockNodesJson.nodes[0].priority).to.equal(1);
      } finally {
        configurationStub.restore();
        // @ts-expect-error - TS2339: to mock
        profileManager.remoteConfig.getConsensusNodes = sinon.stub().returns(consensusNodes);
      }
    });

    it('resourcesForNetworkUpgrade should normalize application.properties before writing chart values', async (): Promise<void> => {
      const templatesDirectory: string = PathEx.join(stagingDirectory, 'templates');
      const applicationPropertiesPath: string = PathEx.join(templatesDirectory, constants.APPLICATION_PROPERTIES);
      const yamlRoot: AnyObject = {};
      const updateApplicationPropertiesStub: sinon.SinonStub = (
        profileManager as unknown as {updateApplicationPropertiesForBlockNode: sinon.SinonStub}
      ).updateApplicationPropertiesForBlockNode;

      fs.mkdirSync(templatesDirectory, {recursive: true});
      fs.writeFileSync(applicationPropertiesPath, 'blockStream.streamMode=RECORDS\n', 'utf8');

      updateApplicationPropertiesStub.callsFake(async (filePath: string): Promise<void> => {
        fs.appendFileSync(filePath, 'blockStream.streamMode=BLOCKS\n', 'utf8');
      });

      await profileManager.resourcesForNetworkUpgrade(
        'hedera.configMaps.applicationProperties',
        constants.APPLICATION_PROPERTIES,
        stagingDirectory,
        yamlRoot,
      );

      expect(updateApplicationPropertiesStub.calledWith(applicationPropertiesPath)).to.be.true;
      expect(yamlRoot.hedera.configMaps.applicationProperties).to.contain('blockStream.streamMode=BLOCKS');

      updateApplicationPropertiesStub.resetBehavior();
      updateApplicationPropertiesStub.resetHistory();
    });

    it('updateApplicationPropertiesForBlockNode should use record streams when TSS is disabled', async (): Promise<void> => {
      const manager: ProfileManager = new ProfileManager(undefined, undefined, temporaryDirectory);
      const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);

      fs.writeFileSync(applicationPropertiesPath, 'blockStream.streamMode=BLOCKS\n', 'utf8');

      const managerPrivate: {
        remoteConfig: RemoteConfigRuntimeStateApi;
        updateApplicationPropertiesForBlockNode: (applicationPropertiesPath: string) => Promise<void>;
      } = manager as unknown as {
        remoteConfig: RemoteConfigRuntimeStateApi;
        updateApplicationPropertiesForBlockNode: (applicationPropertiesPath: string) => Promise<void>;
      };

      const configurationStub: sinon.SinonStub = sinon.stub(managerPrivate.remoteConfig, 'configuration').get(
        (): RemoteConfig =>
          ({
            components: {
              state: {
                blockNodes: [
                  new BlockNodeStateSchema(new ComponentStateMetadataSchema(1, namespace.name, currentClusterName)),
                ],
              },
            },
            state: {
              tssEnabled: false,
            },
            versions: {
              consensusNode: new SemanticVersion<string>('0.75.1'),
            },
          }) as unknown as RemoteConfig,
      );

      try {
        await managerPrivate.updateApplicationPropertiesForBlockNode.call(manager, applicationPropertiesPath);
      } finally {
        configurationStub.restore();
      }

      const applicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');
      expect(applicationProperties).to.contain('blockStream.streamMode=RECORDS');
    });

    it('updateApplicationPropertiesWithRealmAndShard should not duplicate TSS properties', async (): Promise<void> => {
      const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);
      const applicationProperties: string = [
        'hedera.realm=0',
        'hedera.shard=0',
        'tss.hintsEnabled=true',
        'tss.historyEnabled=true',
        'tss.forceMockSignatures=false',
        '',
      ].join('\n');

      fs.writeFileSync(applicationPropertiesPath, applicationProperties, 'utf8');

      const profileManagerPrivate: {
        remoteConfig: RemoteConfigRuntimeStateApi;
        updateApplicationPropertiesWithRealmAndShard: (
          applicationPropertiesPath: string,
          realm: number,
          shard: number,
        ) => Promise<void>;
      } = profileManager as unknown as {
        remoteConfig: RemoteConfigRuntimeStateApi;
        updateApplicationPropertiesWithRealmAndShard: (
          applicationPropertiesPath: string,
          realm: number,
          shard: number,
        ) => Promise<void>;
      };

      const configurationStub: sinon.SinonStub = sinon.stub(profileManagerPrivate.remoteConfig, 'configuration').get(
        (): RemoteConfig =>
          ({
            state: {tssEnabled: true, wrapsEnabled: false},
            versions: {consensusNode: new SemanticVersion<string>(version.HEDERA_PLATFORM_VERSION)},
          }) as unknown as RemoteConfig,
      );

      const updateApplicationPropertiesWithRealmAndShard: (
        applicationPropertiesPath: string,
        realm: number,
        shard: number,
      ) => Promise<void> = profileManagerPrivate.updateApplicationPropertiesWithRealmAndShard;

      try {
        await updateApplicationPropertiesWithRealmAndShard.call(profileManager, applicationPropertiesPath, 1, 2);
        await updateApplicationPropertiesWithRealmAndShard.call(profileManager, applicationPropertiesPath, 1, 2);
      } finally {
        configurationStub.restore();
      }

      const updatedApplicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');

      expect(updatedApplicationProperties.match(/^hedera\.realm=/gm)).to.have.lengthOf(1);
      expect(updatedApplicationProperties.match(/^hedera\.shard=/gm)).to.have.lengthOf(1);
      expect(updatedApplicationProperties.match(/^tss\.hintsEnabled=/gm)).to.have.lengthOf(1);
      expect(updatedApplicationProperties.match(/^tss\.historyEnabled=/gm)).to.have.lengthOf(1);
      expect(updatedApplicationProperties.match(/^tss\.forceMockSignatures=/gm)).to.have.lengthOf(1);
      expect(updatedApplicationProperties).to.contain('hedera.realm=1');
      expect(updatedApplicationProperties).to.contain('hedera.shard=2');
    });

    it('updateApplicationPropertiesWithRealmAndShard should preserve explicit TSS properties', async (): Promise<void> => {
      const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);
      const applicationProperties: string = [
        'hedera.realm=0',
        'hedera.shard=0',
        'tss.hintsEnabled=false',
        'tss.historyEnabled=false',
        'tss.forceMockSignatures=false',
        'tss.wrapsEnabled=false',
        '',
      ].join('\n');

      fs.writeFileSync(applicationPropertiesPath, applicationProperties, 'utf8');

      const profileManagerPrivate: {
        remoteConfig: RemoteConfigRuntimeStateApi;
        updateApplicationPropertiesWithRealmAndShard: (
          applicationPropertiesPath: string,
          realm: number,
          shard: number,
        ) => Promise<void>;
      } = profileManager as unknown as {
        remoteConfig: RemoteConfigRuntimeStateApi;
        updateApplicationPropertiesWithRealmAndShard: (
          applicationPropertiesPath: string,
          realm: number,
          shard: number,
        ) => Promise<void>;
      };

      const configurationStub: sinon.SinonStub = sinon.stub(profileManagerPrivate.remoteConfig, 'configuration').get(
        (): RemoteConfig =>
          ({
            state: {tssEnabled: true, wrapsEnabled: true},
            versions: {consensusNode: new SemanticVersion<string>(version.HEDERA_PLATFORM_VERSION)},
          }) as unknown as RemoteConfig,
      );

      const updateApplicationPropertiesWithRealmAndShard: (
        applicationPropertiesPath: string,
        realm: number,
        shard: number,
      ) => Promise<void> = profileManagerPrivate.updateApplicationPropertiesWithRealmAndShard;

      try {
        await updateApplicationPropertiesWithRealmAndShard.call(profileManager, applicationPropertiesPath, 1, 2);
      } finally {
        configurationStub.restore();
      }

      const updatedApplicationProperties: string = fs.readFileSync(applicationPropertiesPath, 'utf8');

      expect(updatedApplicationProperties).to.contain('tss.hintsEnabled=false');
      expect(updatedApplicationProperties).to.contain('tss.historyEnabled=false');
      expect(updatedApplicationProperties).to.contain('tss.forceMockSignatures=false');
      expect(updatedApplicationProperties).to.contain('tss.wrapsEnabled=false');
    });
  });

  describe('prepareConfigText', (): void => {
    it('should write and return the path to the config.txt file', async (): Promise<void> => {
      const destinationPath: string = PathEx.join(temporaryDirectory, 'staging');
      fs.mkdirSync(destinationPath, {recursive: true});
    });
  });

  describe('saved endpoint extraction', (): void => {
    afterEach((): void => {
      sinon.restore();
    });

    it('reuses saved domainName endpoint from network.json', async (): Promise<void> => {
      const savedDomainName: string = 'network-node1-svc.test-namespace.svc.cluster.local';
      const networkJsonContent: string = JSON.stringify({
        nodeMetadata: [{rosterEntry: {gossipEndpoint: [{port: 50_211, domainName: savedDomainName}]}}],
      });

      const getK8Stub: sinon.SinonStub = sinon.stub().returns({
        pods: (): {list: () => Promise<Array<{podReference: unknown}>>} => ({
          list: async (): Promise<Array<{podReference: unknown}>> => [{podReference: {}}],
        }),
        containers: (): {readByRef: () => {execContainer: () => Promise<string>}} => ({
          readByRef: (): {execContainer: () => Promise<string>} => ({
            execContainer: async (): Promise<string> => networkJsonContent,
          }),
        }),
      });
      sinon
        .stub(
          (profileManager as unknown as {k8Factory: {getK8: (...arguments_: unknown[]) => unknown}}).k8Factory,
          'getK8',
        )
        .callsFake(getK8Stub);

      const savedAddress: Address | undefined = await invokeExtractSavedEndpoint(profileManager, consensusNodes[0], 0);
      expect(savedAddress).to.not.be.undefined;
      expect(savedAddress?.hostString()).to.equal(savedDomainName);
      expect(savedAddress?.port).to.equal(50_211);
    });

    it('ignores saved domainName endpoint when gossip FQDN is restricted', async (): Promise<void> => {
      const savedDomainName: string = 'network-node1-svc.test-namespace.svc.cluster.local';
      const networkJsonContent: string = JSON.stringify({
        nodeMetadata: [{rosterEntry: {gossipEndpoint: [{port: 50_211, domainName: savedDomainName}]}}],
      });

      const getK8Stub: sinon.SinonStub = sinon.stub().returns({
        pods: (): {list: () => Promise<Array<{podReference: unknown}>>} => ({
          list: async (): Promise<Array<{podReference: unknown}>> => [{podReference: {}}],
        }),
        containers: (): {readByRef: () => {execContainer: () => Promise<string>}} => ({
          readByRef: (): {execContainer: () => Promise<string>} => ({
            execContainer: async (): Promise<string> => networkJsonContent,
          }),
        }),
      });
      sinon
        .stub(
          (profileManager as unknown as {k8Factory: {getK8: (...arguments_: unknown[]) => unknown}}).k8Factory,
          'getK8',
        )
        .callsFake(getK8Stub);

      const savedAddress: Address | undefined = await invokeExtractSavedEndpoint(
        profileManager,
        consensusNodes[0],
        0,
        true,
      );
      expect(savedAddress).to.be.undefined;
    });

    it('decodes saved ipAddressV4 and validates it against the expected node service', async (): Promise<void> => {
      const savedIpAddress: string = '10.1.2.3';
      const encodedIpAddress: string = Buffer.from([10, 1, 2, 3]).toString('base64');
      const networkJsonContent: string = JSON.stringify({
        nodeMetadata: [{rosterEntry: {gossipEndpoint: [{port: 50_211, ipAddressV4: encodedIpAddress}]}}],
      });
      const serviceReadStub: sinon.SinonStub = sinon
        .stub()
        .resolves({spec: {clusterIP: '10.96.1.1'}, status: {loadBalancer: {ingress: [{ip: savedIpAddress}]}}});
      const getK8Stub: sinon.SinonStub = sinon.stub().returns({
        pods: (): {list: () => Promise<Array<{podReference: unknown}>>} => ({
          list: async (): Promise<Array<{podReference: unknown}>> => [{podReference: {}}],
        }),
        containers: (): {readByRef: () => {execContainer: () => Promise<string>}} => ({
          readByRef: (): {execContainer: () => Promise<string>} => ({
            execContainer: async (): Promise<string> => networkJsonContent,
          }),
        }),
        services: (): {read: sinon.SinonStub} => ({
          read: serviceReadStub,
        }),
      });
      sinon
        .stub(
          (profileManager as unknown as {k8Factory: {getK8: (...arguments_: unknown[]) => unknown}}).k8Factory,
          'getK8',
        )
        .callsFake(getK8Stub);

      const savedAddress: Address | undefined = await invokeExtractSavedEndpoint(profileManager, consensusNodes[0], 0);
      expect(savedAddress).to.not.be.undefined;
      expect(savedAddress?.hostString()).to.equal(savedIpAddress);
      expect(serviceReadStub.calledOnce).to.equal(true);
      expect(serviceReadStub.firstCall.args[1]).to.equal('network-node1-svc');
    });

    it('falls back to current external address when saved endpoint is not reusable', async (): Promise<void> => {
      const destinationPath: string = PathEx.join(temporaryDirectory, 'config-fallback');
      fs.mkdirSync(destinationPath, {recursive: true});

      const extractSavedEndpointStub: sinon.SinonStub = sinon
        .stub(
          profileManager as unknown as {
            extractSavedEndpoint: (
              consensusNode: ConsensusNode,
              nodeSeq: number,
              gossipFqdnRestricted: boolean,
            ) => Promise<Address | undefined>;
          },
          'extractSavedEndpoint',
        )
        .resolves();

      const externalAddressStub: sinon.SinonStub = sinon
        .stub(Address, 'getExternalAddress')
        .resolves(new Address(50_211, 'fallback-node1.test'));

      const nodeAccountMap: Map<NodeAlias, string> = new Map([[consensusNodes[0].name as NodeAlias, '0.0.3']]);
      const configTxtPath: string = await profileManager.prepareConfigTxt(
        nodeAccountMap,
        [consensusNodes[0]],
        destinationPath,
        constants.HEDERA_APP_NAME,
        constants.HEDERA_CHAIN_ID,
        false,
      );

      expect(extractSavedEndpointStub.calledOnce).to.equal(true);
      expect(externalAddressStub.calledOnce).to.equal(true);
      expect(externalAddressStub.firstCall.args[3]).to.equal(false);
      expect(fs.readFileSync(configTxtPath, 'utf8')).to.contain('fallback-node1.test, 50211');
    });

    it('avoids FQDN gossip endpoints for multi-context config.txt generation', async (): Promise<void> => {
      const destinationPath: string = PathEx.join(temporaryDirectory, 'config-multi-context');
      fs.mkdirSync(destinationPath, {recursive: true});

      const extractSavedEndpointStub: sinon.SinonStub = sinon
        .stub(
          profileManager as unknown as {
            extractSavedEndpoint: (
              consensusNode: ConsensusNode,
              nodeSeq: number,
              gossipFqdnRestricted: boolean,
            ) => Promise<Address | undefined>;
          },
          'extractSavedEndpoint',
        )
        .resolves();

      const externalAddressStub: sinon.SinonStub = sinon
        .stub(Address, 'getExternalAddress')
        .callsFake(
          async (consensusNode: ConsensusNode): Promise<Address> =>
            new Address(50_211, `fallback-${consensusNode.name}.test`),
        );
      sinon
        .stub(
          (profileManager as unknown as {k8Factory: {getK8: (...arguments_: unknown[]) => unknown}}).k8Factory,
          'getK8',
        )
        .returns({});
      const multiContextConsensusNodes: ConsensusNode[] = [
        consensusNodes[0],
        {
          ...consensusNodes[1],
          context: 'second-context',
          cluster: 'second-cluster',
        },
      ];
      const nodeAccountMap: Map<NodeAlias, string> = new Map([
        [multiContextConsensusNodes[0].name as NodeAlias, '0.0.3'],
        [multiContextConsensusNodes[1].name as NodeAlias, '0.0.4'],
      ]);

      const configTxtPath: string = await profileManager.prepareConfigTxt(
        nodeAccountMap,
        multiContextConsensusNodes,
        destinationPath,
        constants.HEDERA_APP_NAME,
        constants.HEDERA_CHAIN_ID,
        false,
      );

      expect(extractSavedEndpointStub.calledTwice).to.equal(true);
      expect(extractSavedEndpointStub.firstCall.args[2]).to.equal(true);
      expect(externalAddressStub.calledTwice).to.equal(true);
      expect(externalAddressStub.firstCall.args[3]).to.equal(true);
      expect(fs.readFileSync(configTxtPath, 'utf8')).to.contain('fallback-node2.test, 50211');
    });
  });

  describe('chainId updates', (): void => {
    it('should update contracts.chainId in application.properties', async (): Promise<void> => {
      const applicationPropertiesPath: string = PathEx.join(temporaryDirectory, constants.APPLICATION_PROPERTIES);
      fs.writeFileSync(
        applicationPropertiesPath,
        ['hedera.realm=0', 'contracts.chainId=295', 'hedera.shard=0'].join('\n') + '\n',
        'utf8',
      );

      // @ts-expect-error to access private method
      await profileManager.updateApplicationPropertiesWithChainId(applicationPropertiesPath, '296');

      const updated: string = fs.readFileSync(applicationPropertiesPath, 'utf8');
      expect(updated).to.contain('contracts.chainId=296');
      expect(updated).not.to.contain('contracts.chainId=295');
    });

    it('should update contracts.chainId in bootstrap.properties', async (): Promise<void> => {
      const bootstrapPropertiesPath: string = PathEx.join(temporaryDirectory, 'bootstrap.properties');
      fs.writeFileSync(
        bootstrapPropertiesPath,
        ['foo=bar', 'contracts.chainId=295', 'baz=qux'].join('\n') + '\n',
        'utf8',
      );

      // @ts-expect-error to access private method
      await profileManager.updateBoostrapPropertiesWithChainId(bootstrapPropertiesPath, '296');

      const updated: string = fs.readFileSync(bootstrapPropertiesPath, 'utf8');
      expect(updated).to.contain('contracts.chainId=296');
      expect(updated).not.to.contain('contracts.chainId=295');
    });

    // eslint-disable-next-line unicorn/consistent-function-scoping
    async function prepareStagingWithCustomApplicationProperties(
      baseApplicationPropertiesContent: string,
      customApplicationPropertiesContent: string,
    ): Promise<{stagedApplicationProperties: string; yamlRoot: AnyObject}> {
      const yamlRoot: AnyObject = {};
      const nodeAliases: NodeAliases = ['node1', 'node2', 'node3'];
      const sourceDirectory: string = PathEx.join(temporaryDirectory, 'source-files');
      fs.rmSync(sourceDirectory, {recursive: true, force: true});
      fs.mkdirSync(sourceDirectory, {recursive: true});

      const baseApplicationPropertiesPath: string = PathEx.join(sourceDirectory, 'base-application.properties');
      const customApplicationPropertiesSourcePath: string = PathEx.join(
        sourceDirectory,
        'custom-application.properties',
      );
      const bootstrapPropertiesSourcePath: string = PathEx.join(sourceDirectory, 'bootstrap.properties');
      // eslint-disable-next-line unicorn/prevent-abbreviations
      const applicationEnvSourcePath: string = PathEx.join(sourceDirectory, 'application.env');
      const apiPermissionSourcePath: string = PathEx.join(sourceDirectory, 'api-permission.properties');
      // eslint-disable-next-line unicorn/prevent-abbreviations
      const log4j2SourcePath: string = PathEx.join(sourceDirectory, 'log4j2.xml');
      const settingsSourcePath: string = PathEx.join(sourceDirectory, 'settings.txt');

      fs.writeFileSync(baseApplicationPropertiesPath, `${baseApplicationPropertiesContent}\n`, 'utf8');
      fs.writeFileSync(customApplicationPropertiesSourcePath, `${customApplicationPropertiesContent}\n`, 'utf8');
      fs.writeFileSync(
        bootstrapPropertiesSourcePath,
        ['contracts.chainId=295', 'some.other.value=true'].join('\n') + '\n',
        'utf8',
      );
      fs.writeFileSync(applicationEnvSourcePath, 'ENV_ONE=value1\n', 'utf8');
      fs.writeFileSync(apiPermissionSourcePath, 'dummy.permission=true\n', 'utf8');
      fs.writeFileSync(log4j2SourcePath, '<Configuration />\n', 'utf8');
      fs.writeFileSync(settingsSourcePath, 'swirld, 123\n', 'utf8');

      configManager.setFlag(flags.applicationProperties, customApplicationPropertiesSourcePath);
      configManager.setFlag(flags.bootstrapProperties, bootstrapPropertiesSourcePath);
      configManager.setFlag(flags.applicationEnv, applicationEnvSourcePath);
      configManager.setFlag(flags.apiPermissionProperties, apiPermissionSourcePath);
      configManager.setFlag(flags.log4j2Xml, log4j2SourcePath);
      configManager.setFlag(flags.settingTxt, settingsSourcePath);
      configManager.setFlag(flags.chainId, '296');

      const profileManagerAccountManager: {
        getNodeAccountMap: () => Map<string, string>;
      } = (profileManager as unknown as {accountManager: {getNodeAccountMap: () => Map<string, string>}})
        .accountManager;
      const getNodeAccountMapStub: sinon.SinonStub = sinon
        .stub(profileManagerAccountManager, 'getNodeAccountMap')
        .returns(
          new Map([
            ['node1', '0.0.3'],
            ['node2', '0.0.4'],
            ['node3', '0.0.5'],
          ]),
        );

      const localConfigConfiguration: {
        realmForDeployment: (deployment: string) => number;
        shardForDeployment: (deployment: string) => number;
      } = (
        profileManager as unknown as {
          localConfig: {
            configuration: {
              realmForDeployment: (deployment: string) => number;
              shardForDeployment: (deployment: string) => number;
            };
          };
        }
      ).localConfig.configuration;
      const realmForDeploymentStub: sinon.SinonStub = sinon
        .stub(localConfigConfiguration, 'realmForDeployment')
        .returns(0);
      const shardForDeploymentStub: sinon.SinonStub = sinon
        .stub(localConfigConfiguration, 'shardForDeployment')
        .returns(0);

      await profileManager.prepareStagingDirectory(
        consensusNodes,
        nodeAliases,
        yamlRoot,
        deploymentName,
        baseApplicationPropertiesPath,
        {
          cacheDir: cacheDirectory,
          releaseTag: version.HEDERA_PLATFORM_VERSION,
          appName: 'HederaNode.jar',
          chainId: '296',
        },
      );

      const stagedApplicationPropertiesPath: string = PathEx.join(
        stagingDirectory,
        'templates',
        constants.APPLICATION_PROPERTIES,
      );
      const stagedBootstrapPropertiesPath: string = PathEx.join(stagingDirectory, 'templates', 'bootstrap.properties');

      const stagedApplicationProperties: string = fs.readFileSync(stagedApplicationPropertiesPath, 'utf8');
      const stagedBootstrapProperties: string = fs.readFileSync(stagedBootstrapPropertiesPath, 'utf8');

      expect(stagedBootstrapProperties).to.contain('contracts.chainId=296');
      expect(stagedBootstrapProperties).not.to.contain('contracts.chainId=295');
      expect(yamlRoot.hedera.configMaps.bootstrapProperties).to.contain('contracts.chainId=296');

      getNodeAccountMapStub.restore();
      realmForDeploymentStub.restore();
      shardForDeploymentStub.restore();

      return {
        stagedApplicationProperties,
        yamlRoot,
      };
    }

    it('prepareStagingDirectory should merge custom application.properties into Solo defaults by default', async (): Promise<void> => {
      const baseApplicationPropertiesContent: string = [
        'hedera.realm=0',
        'hedera.shard=0',
        'contracts.chainId=295',
        'solo.default.only=value',
      ].join('\n');
      const customApplicationPropertiesContent: string = [
        '# no overwrite marker, should merge',
        'contracts.chainId=999',
        'user.custom.only=true',
      ].join('\n');

      const {stagedApplicationProperties, yamlRoot} = await prepareStagingWithCustomApplicationProperties(
        baseApplicationPropertiesContent,
        customApplicationPropertiesContent,
      );

      expect(stagedApplicationProperties).to.contain('solo.default.only=value');
      expect(stagedApplicationProperties).to.contain('user.custom.only=true');
      expect(stagedApplicationProperties).to.contain('contracts.chainId=296');
      expect(stagedApplicationProperties).not.to.contain('contracts.chainId=999');
      expect(yamlRoot.hedera.configMaps.applicationProperties).to.contain('contracts.chainId=296');
    });

    it('prepareStagingDirectory should overwrite when custom application.properties enables overwrite marker', async (): Promise<void> => {
      const baseApplicationPropertiesContent: string = [
        'hedera.realm=0',
        'hedera.shard=0',
        'contracts.chainId=295',
        'solo.default.only=value',
      ].join('\n');
      const customApplicationPropertiesContent: string = [
        '# SOLO_ENABLE_OVERWRITE=true',
        'contracts.chainId=999',
        'user.custom.only=true',
      ].join('\n');

      const {stagedApplicationProperties, yamlRoot} = await prepareStagingWithCustomApplicationProperties(
        baseApplicationPropertiesContent,
        customApplicationPropertiesContent,
      );

      expect(stagedApplicationProperties).to.contain('# SOLO_ENABLE_OVERWRITE=true');
      expect(stagedApplicationProperties).to.contain('user.custom.only=true');
      expect(stagedApplicationProperties).to.contain('contracts.chainId=999');
      expect(stagedApplicationProperties).not.to.contain('solo.default.only=value');
      expect(yamlRoot.hedera.configMaps.applicationProperties).not.to.contain('solo.default.only=value');
    });
  });
});
