// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {after, describe, it} from 'mocha';

import fs from 'node:fs';
import * as yaml from 'yaml';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config-manager.js';
import {ProfileManager} from '../../../src/core/profile-manager.js';
import {getTestCacheDirectory, getTemporaryDirectory} from '../../test-utility.js';
import * as version from '../../../version.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {Templates} from '../../../src/core/templates.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {type ConsensusNode} from '../../../src/core/model/consensus-node.js';
import {KubeConfig} from '@kubernetes/client-node';
import {MissingArgumentError} from '../../../src/core/errors/missing-argument-error.js';
import sinon from 'sinon';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {entityId} from '../../../src/core/helpers.js';

describe('ProfileManager', () => {
  let temporaryDirectory: string, configManager: ConfigManager, profileManager: ProfileManager, cacheDirectory: string;
  const namespace = NamespaceName.of('test-namespace');
  const deploymentName = 'deployment';
  const realm = 1;
  const shard = 2;
  const testProfileFile = PathEx.join('test', 'data', 'test-profiles.yaml');
  const kubeConfig = new KubeConfig();
  kubeConfig.loadFromDefault();
  const consensusNodes: ConsensusNode[] = [
    {
      name: 'node1',
      nodeId: 1,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node1-svc.test-namespace.svc.cluster.local',
    },
    {
      name: 'node2',
      nodeId: 2,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node2-svc.test-namespace.svc.cluster.local',
    },
    {
      name: 'node3',
      nodeId: 3,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-{nodeAlias}-svc.{namespace}.svc',
      fullyQualifiedDomainName: 'network-node3-svc.test-namespace.svc.cluster.local',
    },
  ];

  let stagingDirectory = '';

  before(() => {
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
    profileManager.remoteConfigManager.getConsensusNodes = sinon.stub().returns(consensusNodes);
  });

  after(() => {
    fs.rmSync(temporaryDirectory, {recursive: true});
  });

  it('should throw error for missing profile file', () => {
    try {
      configManager.setFlag(flags.profileFile, 'INVALID');
      profileManager.loadProfiles(true);
      throw new Error();
    } catch (error) {
      expect(error.message).to.include('profileFile does not exist');
    }
  });

  it('should be able to load a profile file', () => {
    configManager.setFlag(flags.profileFile, testProfileFile);
    const profiles = profileManager.loadProfiles(true);
    expect(profiles).not.to.be.null;
    for (const entry of profiles) {
      const profile = entry[1];
      expect(profile).not.to.be.null;
      for (const component of ['consensus', 'rpcRelay', 'haproxy', 'envoyProxy', 'explorer', 'mirror', 'minio']) {
        expect(profile[component]).not.to.be.undefined;
      }
    }
  });

  const testCases = [{profileName: 'test', profileFile: testProfileFile}];

  describe('determine chart values for a profile', () => {
    for (const input of testCases) {
      it(`should determine Solo chart values [profile = ${input.profileName}]`, async () => {
        configManager.setFlag(flags.profileFile, input.profileFile);
        configManager.setFlag(flags.namespace, 'test-namespace');

        const resources = ['templates', 'profiles'];
        for (const directoryName of resources) {
          const sourceDirectory = PathEx.joinWithRealPath(constants.RESOURCES_DIR, directoryName);
          if (!fs.existsSync(sourceDirectory)) {
            continue;
          }

          const destinationDirectory = PathEx.resolve(PathEx.join(cacheDirectory, directoryName));
          if (!fs.existsSync(destinationDirectory)) {
            fs.mkdirSync(destinationDirectory, {recursive: true});
          }

          fs.cpSync(sourceDirectory, destinationDirectory, {recursive: true});
        }

        profileManager.loadProfiles(true);
        const applicationPropertiesFile: string = PathEx.join(cacheDirectory, 'templates', 'application.properties');
        const valuesFileMapping = await profileManager.prepareValuesForSoloChart(
          input.profileName,
          consensusNodes,
          {},
          deploymentName,
          applicationPropertiesFile,
        );
        const valuesFile = Object.values(valuesFileMapping)[0];

        expect(valuesFile).not.to.be.null;
        expect(fs.existsSync(valuesFile)).to.be.ok;

        // validate the yaml
        const valuesYaml: any = yaml.parse(fs.readFileSync(valuesFile).toString());
        expect(valuesYaml.hedera.nodes.length).to.equal(3);
        expect(valuesYaml.defaults.root.resources.limits.cpu).not.to.be.null;
        expect(valuesYaml.defaults.root.resources.limits.memory).not.to.be.null;

        // check all sidecars have resources
        for (const component of constants.HEDERA_NODE_SIDECARS) {
          expect(valuesYaml.defaults.sidecars[component].resources.limits.cpu).not.to.be.null;
          expect(valuesYaml.defaults.sidecars[component].resources.limits.memory).not.to.be.null;
        }

        // check proxies have resources
        for (const component of ['haproxy', 'envoyProxy']) {
          expect(valuesYaml.defaults[component].resources.limits.cpu).not.to.be.null;
          expect(valuesYaml.defaults[component].resources.limits.memory).not.to.be.null;
        }

        // check minio-tenant has resources
        expect(valuesYaml['minio-server'].tenant.pools[0].resources.limits.cpu).not.to.be.null;
        expect(valuesYaml['minio-server'].tenant.pools[0].resources.limits.memory).not.to.be.null;
      });

      it('prepareValuesForSoloChart should set the value of a key to the contents of a file', async () => {
        configManager.setFlag(flags.profileFile, testProfileFile);
        configManager.setFlag(flags.namespace, 'test-namespace');

        // profileManager.loadProfiles(true)
        const file = PathEx.join(temporaryDirectory, 'application.env');
        const fileContents = '# row 1\n# row 2\n# row 3';
        fs.writeFileSync(file, fileContents);
        configManager.setFlag(flags.applicationEnv, file);
        const destinationFile: string = PathEx.join(stagingDirectory, 'templates', 'application.env');
        const applicationPropertiesFile: string = PathEx.join(stagingDirectory, 'templates', 'application.properties');
        fs.cpSync(file, destinationFile, {force: true});
        const cachedValuesFileMapping = await profileManager.prepareValuesForSoloChart(
          'test',
          consensusNodes,
          {},
          deploymentName,
          applicationPropertiesFile,
        );
        const cachedValuesFile = Object.values(cachedValuesFileMapping)[0];
        const valuesYaml: any = yaml.parse(fs.readFileSync(cachedValuesFile).toString());
        expect(valuesYaml.hedera.configMaps.applicationEnv).to.equal(fileContents);
      });

      it(`should determine mirror-node chart values [profile = ${input.profileName}]`, async () => {
        configManager.setFlag(flags.profileFile, input.profileFile);
        configManager.setFlag(flags.cacheDir, getTestCacheDirectory('ProfileManager'));
        configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION);
        profileManager.loadProfiles(true);
        const valuesFile = (await profileManager.prepareValuesForMirrorNodeChart(input.profileName)) as string;
        expect(fs.existsSync(valuesFile)).to.be.ok;

        // validate yaml
        const valuesYaml: any = yaml.parse(fs.readFileSync(valuesFile).toString());
        expect(valuesYaml.postgresql.persistence.size).not.to.be.null;
        expect(valuesYaml.postgresql.postgresql.resources.limits.cpu).not.to.be.null;
        expect(valuesYaml.postgresql.postgresql.resources.limits.memory).not.to.be.null;
        for (const component of ['grpc', 'rest', 'web3', 'importer']) {
          expect(valuesYaml[component].resources.limits.cpu).not.to.be.null;
          expect(valuesYaml[component].resources.limits.memory).not.to.be.null;
          expect(valuesYaml[component].readinessProbe.failureThreshold).to.equal(60);
          expect(valuesYaml[component].livenessProbe.failureThreshold).to.equal(60);
        }
      });

      it(`should determine hedera-explorer chart values [profile = ${input.profileName}]`, async () => {
        configManager.setFlag(flags.profileFile, input.profileFile);
        configManager.setFlag(flags.cacheDir, getTestCacheDirectory('ProfileManager'));
        configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION);
        profileManager.loadProfiles(true);
        const valuesFile = (await profileManager.prepareValuesHederaExplorerChart(input.profileName)) as string;
        expect(fs.existsSync(valuesFile)).to.be.ok;

        // validate yaml
        const valuesYaml: any = yaml.parse(fs.readFileSync(valuesFile).toString());
        expect(valuesYaml.resources.limits.cpu).not.to.be.null;
        expect(valuesYaml.resources.limits.memory).not.to.be.null;
      });

      it(`should determine rpc-relay chart values [profile = ${input.profileName}]`, async () => {
        configManager.setFlag(flags.profileFile, input.profileFile);
        profileManager.loadProfiles(true);
        const valuesFile = (await profileManager.prepareValuesForRpcRelayChart(input.profileName)) as string;
        expect(fs.existsSync(valuesFile)).to.be.ok;
        // validate yaml
        const valuesYaml: any = yaml.parse(fs.readFileSync(valuesFile).toString());
        expect(valuesYaml.resources.limits.cpu).not.to.be.null;
        expect(valuesYaml.resources.limits.memory).not.to.be.null;
      });
    }
  });

  describe('prepareConfigText', () => {
    it('should write and return the path to the config.txt file', async () => {
      const nodeAccountMap = new Map<NodeAlias, string>();
      nodeAccountMap.set('node1', entityId(shard, realm, 3));
      nodeAccountMap.set('node2', entityId(shard, realm, 4));
      nodeAccountMap.set('node3', entityId(shard, realm, 5));
      const destinationPath = PathEx.join(temporaryDirectory, 'staging');
      fs.mkdirSync(destinationPath, {recursive: true});
      const renderedConfigFile = await profileManager.prepareConfigTxt(
        nodeAccountMap,
        consensusNodes,
        destinationPath,
        version.HEDERA_PLATFORM_VERSION,
        {},
      );

      // expect that the config.txt file was created and exists
      const configFile = PathEx.join(destinationPath, 'config.txt');
      expect(renderedConfigFile).to.equal(configFile);
      expect(fs.existsSync(configFile)).to.be.ok;

      const configText = fs.readFileSync(configFile).toString();

      // expect that the config.txt file contains the namespace
      expect(configText).to.include(namespace);
      // expect that the config.txt file contains the node account IDs
      expect(configText).to.include(entityId(shard, realm, 3));
      expect(configText).to.include(entityId(shard, realm, 4));
      expect(configText).to.include(entityId(shard, realm, 5));
      // expect the config.txt file to contain the node IDs
      expect(configText).to.include('node1');
      expect(configText).to.include('node2');
      expect(configText).to.include('node3');
    });

    it('should fail when no nodeAliases', async () => {
      const nodeAccountMap = new Map<NodeAlias, string>();
      try {
        await profileManager.prepareConfigTxt(nodeAccountMap, consensusNodes, '', version.HEDERA_PLATFORM_VERSION, {});
      } catch (error) {
        expect(error).to.be.instanceOf(MissingArgumentError);
        expect(error.message).to.include('nodeAccountMap the map of node IDs to account IDs is required');
      }
    });

    it('should fail when destPath does not exist', async () => {
      const nodeAccountMap = new Map<NodeAlias, string>();
      nodeAccountMap.set('node1', entityId(shard, realm, 3));
      const destinationPath = PathEx.join(temporaryDirectory, 'missing-directory');
      try {
        await profileManager.prepareConfigTxt(
          nodeAccountMap,
          consensusNodes,
          destinationPath,
          version.HEDERA_PLATFORM_VERSION,
          {},
        );
      } catch (error) {
        expect(error.message).to.contain('config destPath does not exist');
        expect(error.message).to.contain(destinationPath);
      }
    });
  });
});
