/**
 * SPDX-License-Identifier: Apache-2.0
 */
import 'chai-as-promised';

import {expect} from 'chai';
import {after, before, describe, it} from 'mocha';

import fs from 'fs';
import os from 'os';
import path from 'path';
import {Flags as flags} from '../src/commands/flags.js';
import {ClusterCommand} from '../src/commands/cluster/index.js';
import {InitCommand} from '../src/commands/init.js';
import {NetworkCommand} from '../src/commands/network.js';
import {NodeCommand} from '../src/commands/node/index.js';
import {type DependencyManager} from '../src/core/dependency_managers/index.js';
import {sleep} from '../src/core/helpers.js';
import {AccountBalanceQuery, AccountCreateTransaction, Hbar, HbarUnit, PrivateKey} from '@hashgraph/sdk';
import {NODE_LOG_FAILURE_MSG, ROOT_CONTAINER, SOLO_LOGS_DIR, SOLO_TEST_CLUSTER} from '../src/core/constants.js';
import crypto from 'crypto';
import {AccountCommand} from '../src/commands/account.js';
import * as NodeCommandConfigs from '../src/commands/node/configs.js';

import {type SoloLogger} from '../src/core/logging.js';
import {type BaseCommand} from '../src/commands/base.js';
import {type NodeAlias} from '../src/types/aliases.js';
import {type NetworkNodeServices} from '../src/core/network_node_services.js';
import {type K8Factory} from '../src/core/kube/k8_factory.js';
import {type AccountManager} from '../src/core/account_manager.js';
import {type PlatformInstaller} from '../src/core/platform_installer.js';
import {type ProfileManager} from '../src/core/profile_manager.js';
import {type LeaseManager} from '../src/core/lease/lease_manager.js';
import {type CertificateManager} from '../src/core/certificate_manager.js';
import {type LocalConfig} from '../src/core/config/local_config.js';
import {type RemoteConfigManager} from '../src/core/config/remote/remote_config_manager.js';
import * as constants from '../src/core/constants.js';
import {Templates} from '../src/core/templates.js';
import {type ConfigManager} from '../src/core/config_manager.js';
import {type Helm} from '../src/core/helm.js';
import {type ChartManager} from '../src/core/chart_manager.js';
import {type PackageDownloader} from '../src/core/package_downloader.js';
import {type KeyManager} from '../src/core/key_manager.js';
import {HEDERA_PLATFORM_VERSION} from '../version.js';
import {Duration} from '../src/core/time/duration.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from './test_container.js';
import {NamespaceName} from '../src/core/kube/resources/namespace/namespace_name.js';
import {PodRef} from '../src/core/kube/resources/pod/pod_ref.js';
import {ContainerRef} from '../src/core/kube/resources/container/container_ref.js';
import {type NetworkNodes} from '../src/core/network_nodes.js';
import {InjectTokens} from '../src/core/dependency_injection/inject_tokens.js';
import {DeploymentCommand} from '../src/commands/deployment.js';
import {K8Client} from '../src/core/kube/k8_client/k8_client.js';

export const TEST_CLUSTER = SOLO_TEST_CLUSTER;
export const HEDERA_PLATFORM_VERSION_TAG = HEDERA_PLATFORM_VERSION;

export const BASE_TEST_DIR = path.join('test', 'data', 'tmp');

export let testLogger: SoloLogger = container.resolve<SoloLogger>(InjectTokens.SoloLogger);

export function getTestCacheDir(testName?: string) {
  const d = testName ? path.join(BASE_TEST_DIR, testName) : BASE_TEST_DIR;

  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, {recursive: true});
  }
  return d;
}

export function getTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'));
}

/** Get argv with defaults */
export function getDefaultArgv(namespace: NamespaceName) {
  const argv: Record<string, any> = {};
  for (const f of flags.allFlags) {
    argv[f.name] = f.definition.defaultValue;
  }

  const currentDeployment =
    argv[flags.deployment.name] || `${namespace?.name || argv[flags.namespace.name]}-deployment`;
  const cacheDir = getTestCacheDir();
  argv.cacheDir = cacheDir;
  argv[flags.cacheDir.name] = cacheDir;
  argv.deployment = currentDeployment;
  argv[flags.deployment.name] = currentDeployment;
  argv[flags.clusterRef.name] = 'cluster-1';
  argv[flags.deploymentClusters.name] = ['cluster-1'];
  argv[flags.context.name] = new K8Client(undefined).contexts().readCurrent();
  return argv;
}

interface TestOpts {
  logger: SoloLogger;
  helm: Helm;
  k8Factory: K8Factory;
  chartManager: ChartManager;
  configManager: ConfigManager;
  downloader: PackageDownloader;
  platformInstaller: PlatformInstaller;
  depManager: DependencyManager;
  keyManager: KeyManager;
  accountManager: AccountManager;
  cacheDir: string;
  profileManager: ProfileManager;
  leaseManager: LeaseManager;
  certificateManager: CertificateManager;
  remoteConfigManager: RemoteConfigManager;
  localConfig: LocalConfig;
}

interface BootstrapResponse {
  deployment: string;
  namespace: NamespaceName;
  opts: TestOpts;
  manager: {
    accountManager: AccountManager;
  };
  cmd: {
    initCmd: InitCommand;
    clusterCmd: ClusterCommand;
    networkCmd: NetworkCommand;
    nodeCmd: NodeCommand;
    accountCmd: AccountCommand;
    deploymentCmd: DeploymentCommand;
  };
}

/** Initialize common test variables */
export function bootstrapTestVariables(
  testName: string,
  argv: any,
  k8FactoryArg: K8Factory | null = null,
  initCmdArg: InitCommand | null = null,
  clusterCmdArg: ClusterCommand | null = null,
  networkCmdArg: NetworkCommand | null = null,
  nodeCmdArg: NodeCommand | null = null,
  accountCmdArg: AccountCommand | null = null,
  deploymentCmdArg: DeploymentCommand | null = null,
): BootstrapResponse {
  const namespace: NamespaceName = NamespaceName.of(argv[flags.namespace.name] || 'bootstrap-ns');
  const deployment: string = argv[flags.deployment.name] || `${namespace.name}-deployment`;
  const cacheDir: string = argv[flags.cacheDir.name] || getTestCacheDir(testName);
  resetForTest(namespace.name, cacheDir);
  const configManager: ConfigManager = container.resolve(InjectTokens.ConfigManager);
  configManager.update(argv);

  const downloader: PackageDownloader = container.resolve(InjectTokens.PackageDownloader);
  const depManager: DependencyManager = container.resolve(InjectTokens.DependencyManager);
  const helm: Helm = container.resolve(InjectTokens.Helm);
  const chartManager: ChartManager = container.resolve(InjectTokens.ChartManager);
  const keyManager: KeyManager = container.resolve(InjectTokens.KeyManager);
  const k8Factory: K8Factory = k8FactoryArg || container.resolve(InjectTokens.K8Factory);
  const accountManager: AccountManager = container.resolve(InjectTokens.AccountManager);
  const platformInstaller: PlatformInstaller = container.resolve(InjectTokens.PlatformInstaller);
  const profileManager: ProfileManager = container.resolve(InjectTokens.ProfileManager);
  const leaseManager: LeaseManager = container.resolve(InjectTokens.LeaseManager);
  const certificateManager: CertificateManager = container.resolve(InjectTokens.CertificateManager);
  const localConfig: LocalConfig = container.resolve(InjectTokens.LocalConfig);
  const remoteConfigManager: RemoteConfigManager = container.resolve(InjectTokens.RemoteConfigManager);
  testLogger = container.resolve(InjectTokens.SoloLogger);

  const opts: TestOpts = {
    logger: testLogger,
    helm,
    k8Factory,
    chartManager,
    configManager,
    downloader,
    platformInstaller,
    depManager,
    keyManager,
    accountManager,
    cacheDir,
    profileManager,
    leaseManager,
    certificateManager,
    localConfig,
    remoteConfigManager,
  };

  const initCmd: InitCommand = initCmdArg || new InitCommand(opts);
  const clusterCmd: ClusterCommand = clusterCmdArg || new ClusterCommand(opts);
  const networkCmd: NetworkCommand = networkCmdArg || new NetworkCommand(opts);
  const nodeCmd: NodeCommand = nodeCmdArg || new NodeCommand(opts);
  const accountCmd: AccountCommand = accountCmdArg || new AccountCommand(opts, constants.SHORTER_SYSTEM_ACCOUNTS);
  const deploymentCmd: DeploymentCommand = deploymentCmdArg || new DeploymentCommand(opts);
  return {
    namespace,
    deployment,
    opts,
    manager: {
      accountManager,
    },
    cmd: {
      initCmd,
      clusterCmd,
      networkCmd,
      nodeCmd,
      accountCmd,
      deploymentCmd,
    },
  };
}

/** Bootstrap network in a given namespace, then run the test call back providing the bootstrap response */
export function e2eTestSuite(
  testName: string,
  argv: Record<any, any>,
  k8FactoryArg: K8Factory | null = null,
  initCmdArg: InitCommand | null = null,
  clusterCmdArg: ClusterCommand | null = null,
  networkCmdArg: NetworkCommand | null = null,
  nodeCmdArg: NodeCommand | null = null,
  accountCmdArg: AccountCommand | null = null,
  startNodes = true,
  testsCallBack: (bootstrapResp: BootstrapResponse) => void = () => {},
) {
  const bootstrapResp = bootstrapTestVariables(
    testName,
    argv,
    k8FactoryArg,
    initCmdArg,
    clusterCmdArg,
    networkCmdArg,
    nodeCmdArg,
    accountCmdArg,
  );
  const namespace: NamespaceName = bootstrapResp.namespace;
  const initCmd: InitCommand = bootstrapResp.cmd.initCmd;
  const k8Factory: K8Factory = bootstrapResp.opts.k8Factory;
  const clusterCmd: ClusterCommand = bootstrapResp.cmd.clusterCmd;
  const networkCmd: NetworkCommand = bootstrapResp.cmd.networkCmd;
  const nodeCmd: NodeCommand = bootstrapResp.cmd.nodeCmd;
  const chartManager: ChartManager = bootstrapResp.opts.chartManager;
  const deploymentCmd: DeploymentCommand = bootstrapResp.cmd.deploymentCmd;

  describe(`E2E Test Suite for '${testName}'`, function () {
    this.bail(true); // stop on first failure, nothing else will matter if network doesn't come up correctly

    describe(`Bootstrap network for test [release ${argv[flags.releaseTag.name]}]`, () => {
      before(() => {
        bootstrapResp.opts.logger.showUser(
          `------------------------- START: bootstrap (${testName}) ----------------------------`,
        );
      });

      after(async function () {
        this.timeout(Duration.ofMinutes(5).toMillis());
        await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
        bootstrapResp.opts.logger.showUser(
          `------------------------- END: bootstrap (${testName}) ----------------------------`,
        );
      });

      it('should cleanup previous deployment', async () => {
        await initCmd.init(argv);

        if (await k8Factory.default().namespaces().has(namespace)) {
          await k8Factory.default().namespaces().delete(namespace);

          while (await k8Factory.default().namespaces().has(namespace)) {
            testLogger.debug(`Namespace ${namespace} still exist. Waiting...`);
            await sleep(Duration.ofSeconds(2));
          }
        }

        if (
          !(await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
        ) {
          await clusterCmd.handlers.setup(argv);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('should succeed with deployment create', async () => {
        expect(await deploymentCmd.create(argv)).to.be.true;
      });

      it('generate key files', async () => {
        expect(await nodeCmd.handlers.keys(argv)).to.be.true;
        expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.KEYS_CONFIGS_NAME)).to.deep.equal([
          flags.devMode.constName,
          flags.quiet.constName,
          'consensusNodes',
          'contexts',
        ]);
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('should succeed with network deploy', async () => {
        await networkCmd.deploy(argv);

        expect(networkCmd.getUnusedConfigs(NetworkCommand.DEPLOY_CONFIGS_NAME)).to.deep.equal([
          flags.apiPermissionProperties.constName,
          flags.applicationEnv.constName,
          flags.applicationProperties.constName,
          flags.bootstrapProperties.constName,
          flags.chainId.constName,
          flags.log4j2Xml.constName,
          flags.deployment.constName,
          flags.profileFile.constName,
          flags.profileName.constName,
          flags.quiet.constName,
          flags.settingTxt.constName,
          flags.grpcTlsKeyPath.constName,
          flags.grpcWebTlsKeyPath.constName,
          flags.gcsAccessKey.constName,
          flags.gcsSecrets.constName,
          flags.gcsEndpoint.constName,
          flags.awsAccessKey.constName,
          flags.awsSecrets.constName,
          flags.awsEndpoint.constName,
        ]);
      }).timeout(Duration.ofMinutes(5).toMillis());

      if (startNodes) {
        it('should succeed with node setup command', async () => {
          // cache this, because `solo node setup.finalize()` will reset it to false
          try {
            expect(await nodeCmd.handlers.setup(argv)).to.be.true;
            expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.SETUP_CONFIGS_NAME)).to.deep.equal([
              flags.quiet.constName,
              flags.devMode.constName,
              flags.adminPublicKeys.constName,
              'contexts',
            ]);
          } catch (e) {
            nodeCmd.logger.showUserError(e);
            expect.fail();
          }
        }).timeout(Duration.ofMinutes(4).toMillis());

        it('should succeed with node start command', async () => {
          try {
            expect(await nodeCmd.handlers.start(argv)).to.be.true;
          } catch (e) {
            nodeCmd.logger.showUserError(e);
            expect.fail();
          }
        }).timeout(Duration.ofMinutes(30).toMillis());

        it('node log command should work', async () => {
          expect(await nodeCmd.handlers.logs(argv)).to.be.true;

          const soloLogPath = path.join(SOLO_LOGS_DIR, 'solo.log');
          const soloLog = fs.readFileSync(soloLogPath, 'utf8');

          expect(soloLog).to.not.have.string(NODE_LOG_FAILURE_MSG);
        }).timeout(Duration.ofMinutes(5).toMillis());
      }
    });

    describe(testName, () => {
      testsCallBack(bootstrapResp);
    });
  });
}

export function balanceQueryShouldSucceed(
  accountManager: AccountManager,
  cmd: BaseCommand,
  namespace: NamespaceName,
  skipNodeAlias?: NodeAlias,
) {
  it('Balance query should succeed', async () => {
    try {
      const argv = getDefaultArgv(namespace);
      expect(accountManager._nodeClient).to.be.null;
      await accountManager.refreshNodeClient(
        namespace,
        skipNodeAlias,
        cmd.getClusterRefs(),
        argv[flags.deployment.name],
      );
      expect(accountManager._nodeClient).not.to.be.null;

      const balance = await new AccountBalanceQuery()
        .setAccountId(accountManager._nodeClient.getOperator().accountId)
        .execute(accountManager._nodeClient);

      expect(balance.hbars).not.be.null;
    } catch (e) {
      cmd.logger.showUserError(e);
      expect.fail();
    }
    await sleep(Duration.ofSeconds(1));
  }).timeout(Duration.ofMinutes(2).toMillis());
}

export function accountCreationShouldSucceed(
  accountManager: AccountManager,
  nodeCmd: BaseCommand,
  namespace: NamespaceName,
  skipNodeAlias?: NodeAlias,
) {
  it('Account creation should succeed', async () => {
    try {
      const argv = getDefaultArgv(namespace);
      await accountManager.refreshNodeClient(
        namespace,
        skipNodeAlias,
        nodeCmd.getClusterRefs(),
        argv[flags.deployment.name],
      );
      expect(accountManager._nodeClient).not.to.be.null;
      const privateKey = PrivateKey.generate();
      const amount = 100;

      const newAccount = await new AccountCreateTransaction()
        .setKey(privateKey)
        .setInitialBalance(Hbar.from(amount, HbarUnit.Hbar))
        .execute(accountManager._nodeClient);

      // Get the new account ID
      const getReceipt = await newAccount.getReceipt(accountManager._nodeClient);
      const accountInfo = {
        accountId: getReceipt.accountId.toString(),
        privateKey: privateKey.toString(),
        publicKey: privateKey.publicKey.toString(),
        balance: amount,
      };

      expect(accountInfo.accountId).not.to.be.null;
      expect(accountInfo.balance).to.equal(amount);
    } catch (e) {
      nodeCmd.logger.showUserError(e);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(2).toMillis());
}

export async function getNodeAliasesPrivateKeysHash(
  networkNodeServicesMap: Map<NodeAlias, NetworkNodeServices>,
  k8Factory: K8Factory,
  destDir: string,
) {
  const dataKeysDir = path.join(constants.HEDERA_HAPI_PATH, 'data', 'keys');
  const tlsKeysDir = constants.HEDERA_HAPI_PATH;
  const nodeKeyHashMap = new Map<NodeAlias, Map<string, string>>();
  for (const networkNodeServices of networkNodeServicesMap.values()) {
    const keyHashMap = new Map<string, string>();
    const nodeAlias = networkNodeServices.nodeAlias;
    const uniqueNodeDestDir = path.join(destDir, nodeAlias);
    if (!fs.existsSync(uniqueNodeDestDir)) {
      fs.mkdirSync(uniqueNodeDestDir, {recursive: true});
    }
    await addKeyHashToMap(
      networkNodeServices.namespace,
      k8Factory,
      nodeAlias,
      dataKeysDir,
      uniqueNodeDestDir,
      keyHashMap,
      Templates.renderGossipPemPrivateKeyFile(nodeAlias),
    );
    await addKeyHashToMap(
      networkNodeServices.namespace,
      k8Factory,
      nodeAlias,
      tlsKeysDir,
      uniqueNodeDestDir,
      keyHashMap,
      'hedera.key',
    );
    nodeKeyHashMap.set(nodeAlias, keyHashMap);
  }
  return nodeKeyHashMap;
}

async function addKeyHashToMap(
  namespace: NamespaceName,
  k8Factory: K8Factory,
  nodeAlias: NodeAlias,
  keyDir: string,
  uniqueNodeDestDir: string,
  keyHashMap: Map<string, string>,
  privateKeyFileName: string,
) {
  await k8Factory
    .default()
    .containers()
    .readByRef(ContainerRef.of(PodRef.of(namespace, Templates.renderNetworkPodName(nodeAlias)), ROOT_CONTAINER))
    .copyFrom(path.join(keyDir, privateKeyFileName), uniqueNodeDestDir);
  const keyBytes = fs.readFileSync(path.join(uniqueNodeDestDir, privateKeyFileName));
  const keyString = keyBytes.toString();
  keyHashMap.set(privateKeyFileName, crypto.createHash('sha256').update(keyString).digest('base64'));
}

export const testLocalConfigData = {
  userEmailAddress: 'john.doe@example.com',
  soloVersion: '1.0.0',
  deployments: {
    deployment: {
      clusters: ['cluster-1'],
      namespace: 'solo-e2e',
    },
    'deployment-2': {
      clusters: ['cluster-2'],
      namespace: 'solo-2',
    },
    'deployment-3': {
      clusters: ['cluster-3'],
      namespace: 'solo-3',
    },
  },
  clusterRefs: {
    'cluster-1': 'context-1',
    'cluster-2': 'context-2',
  },
};
