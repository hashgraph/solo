/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {expect} from 'chai';
import {after, describe, it} from 'mocha';

import fs from 'fs';
import * as yaml from 'yaml';
import path from 'path';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as constants from '../../../src/core/constants.js';
import {type ConfigManager} from '../../../src/core/config_manager.js';
import {ProfileManager} from '../../../src/core/profile_manager.js';
import {getTestCacheDir, getTmpDir} from '../../test_util.js';
import * as version from '../../../version.js';
import {type NodeAlias} from '../../../src/types/aliases.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test_container.js';
import {Templates} from '../../../src/core/templates.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {type ConsensusNode} from '../../../src/core/model/consensus_node.js';
import {KubeConfig} from '@kubernetes/client-node';
import {MissingArgumentError} from '../../../src/core/errors.js';

describe('ProfileManager', () => {
  let tmpDir: string, configManager: ConfigManager, profileManager: ProfileManager, cacheDir: string;
  const namespace = NamespaceName.of('test-namespace');
  const testProfileFile = path.join('test', 'data', 'test-profiles.yaml');
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
      dnsConsensusNodePattern: 'network-${nodeAlias}-svc.${namespace}.svc',
      fullyQualifiedDomainName: 'network-node1-svc.test-namespace.svc.cluster.local',
    },
    {
      name: 'node2',
      nodeId: 2,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-${nodeAlias}-svc.${namespace}.svc',
      fullyQualifiedDomainName: 'network-node2-svc.test-namespace.svc.cluster.local',
    },
    {
      name: 'node3',
      nodeId: 3,
      namespace: namespace.name,
      cluster: kubeConfig.getCurrentCluster().name,
      context: kubeConfig.getCurrentContext(),
      dnsBaseDomain: 'cluster.local',
      dnsConsensusNodePattern: 'network-${nodeAlias}-svc.${namespace}.svc',
      fullyQualifiedDomainName: 'network-node3-svc.test-namespace.svc.cluster.local',
    },
  ];
  let stagingDir = '';

  before(() => {
    resetForTest(namespace.name);
    tmpDir = getTmpDir();
    configManager = container.resolve(InjectTokens.ConfigManager);
    profileManager = new ProfileManager(undefined, undefined, tmpDir);
    configManager.setFlag(flags.nodeAliasesUnparsed, 'node1,node2,node4');
    configManager.setFlag(flags.cacheDir, getTestCacheDir('ProfileManager'));
    configManager.setFlag(flags.releaseTag, version.HEDERA_PLATFORM_VERSION);
    cacheDir = configManager.getFlag<string>(flags.cacheDir) as string;
    configManager.setFlag(flags.apiPermissionProperties, flags.apiPermissionProperties.definition.defaultValue);
    configManager.setFlag(flags.applicationEnv, flags.applicationEnv.definition.defaultValue);
    configManager.setFlag(flags.applicationProperties, flags.applicationProperties.definition.defaultValue);
    configManager.setFlag(flags.bootstrapProperties, flags.bootstrapProperties.definition.defaultValue);
    configManager.setFlag(flags.log4j2Xml, flags.log4j2Xml.definition.defaultValue);
    configManager.setFlag(flags.settingTxt, flags.settingTxt.definition.defaultValue);
    stagingDir = Templates.renderStagingDir(
      configManager.getFlag(flags.cacheDir),
      configManager.getFlag(flags.releaseTag),
    );
    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, {recursive: true});
    }
  });

  after(() => {
    fs.rmSync(tmpDir, {recursive: true});
  });

  it('should throw error for missing profile file', () => {
    try {
      configManager.setFlag(flags.profileFile, 'INVALID');
      profileManager.loadProfiles(true);
      throw new Error();
    } catch (e) {
      expect(e.message).to.include('profileFile does not exist');
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
    testCases.forEach(input => {
      it(`should determine Solo chart values [profile = ${input.profileName}]`, async () => {
        configManager.setFlag(flags.profileFile, input.profileFile);
        configManager.setFlag(flags.namespace, 'test-namespace');

        const resources = ['templates', 'profiles'];
        for (const dirName of resources) {
          const srcDir = path.resolve(path.join(constants.RESOURCES_DIR, dirName));
          if (!fs.existsSync(srcDir)) continue;

          const destDir = path.resolve(path.join(cacheDir, dirName));
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, {recursive: true});
          }

          fs.cpSync(srcDir, destDir, {recursive: true});
        }

        profileManager.loadProfiles(true);
        const valuesFile = await profileManager.prepareValuesForSoloChart(input.profileName, consensusNodes);
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
        const file = path.join(tmpDir, 'application.env');
        const fileContents = '# row 1\n# row 2\n# row 3';
        fs.writeFileSync(file, fileContents);
        configManager.setFlag(flags.applicationEnv, file);
        const destFile = path.join(stagingDir, 'templates', 'application.env');
        fs.cpSync(file, destFile, {force: true});
        const cachedValuesFile = await profileManager.prepareValuesForSoloChart('test', consensusNodes);
        const valuesYaml: any = yaml.parse(fs.readFileSync(cachedValuesFile).toString());
        expect(valuesYaml.hedera.configMaps.applicationEnv).to.equal(fileContents);
      });

      it(`should determine mirror-node chart values [profile = ${input.profileName}]`, async () => {
        configManager.setFlag(flags.profileFile, input.profileFile);
        configManager.setFlag(flags.cacheDir, getTestCacheDir('ProfileManager'));
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
        configManager.setFlag(flags.cacheDir, getTestCacheDir('ProfileManager'));
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
    });
  });

  describe('prepareConfigText', () => {
    it('should write and return the path to the config.txt file', async () => {
      const nodeAccountMap = new Map<NodeAlias, string>();
      nodeAccountMap.set('node1', '0.0.3');
      nodeAccountMap.set('node2', '0.0.4');
      nodeAccountMap.set('node3', '0.0.5');
      const destPath = path.join(tmpDir, 'staging');
      fs.mkdirSync(destPath, {recursive: true});
      const renderedConfigFile = await profileManager.prepareConfigTxt(
        nodeAccountMap,
        consensusNodes,
        destPath,
        version.HEDERA_PLATFORM_VERSION,
      );

      // expect that the config.txt file was created and exists
      const configFile = path.join(destPath, 'config.txt');
      expect(renderedConfigFile).to.equal(configFile);
      expect(fs.existsSync(configFile)).to.be.ok;

      const configText = fs.readFileSync(configFile).toString();

      // expect that the config.txt file contains the namespace
      expect(configText).to.include(namespace);
      // expect that the config.txt file contains the node account IDs
      expect(configText).to.include('0.0.3');
      expect(configText).to.include('0.0.4');
      expect(configText).to.include('0.0.5');
      // expect the config.txt file to contain the node IDs
      expect(configText).to.include('node1');
      expect(configText).to.include('node2');
      expect(configText).to.include('node3');
    });

    it('should fail when no nodeAliases', async () => {
      const nodeAccountMap = new Map<NodeAlias, string>();
      try {
        await profileManager.prepareConfigTxt(nodeAccountMap, consensusNodes, '', version.HEDERA_PLATFORM_VERSION);
      } catch (e) {
        expect(e).to.be.instanceOf(MissingArgumentError);
        expect(e.message).to.include('nodeAccountMap the map of node IDs to account IDs is required');
      }
    });

    it('should fail when destPath does not exist', async () => {
      const nodeAccountMap = new Map<NodeAlias, string>();
      nodeAccountMap.set('node1', '0.0.3');
      const destPath = path.join(tmpDir, 'missing-directory');
      try {
        await profileManager.prepareConfigTxt(
          nodeAccountMap,
          consensusNodes,
          destPath,
          version.HEDERA_PLATFORM_VERSION,
        );
      } catch (e) {
        expect(e.message).to.contain('config destPath does not exist');
        expect(e.message).to.contain(destPath);
      }
    });
  });
});
