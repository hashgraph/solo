/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import 'chai-as-promised';

import {expect} from 'chai';
import {describe, it, after, before} from 'mocha';

import fs from 'fs';
import os from 'os';
import path from 'path';
import {Flags as flags} from '../src/commands/flags.js';
import {ClusterCommand} from '../src/commands/cluster.js';
import {InitCommand} from '../src/commands/init.js';
import {NetworkCommand} from '../src/commands/network.js';
import {NodeCommand} from '../src/commands/node/index.js';
import {DependencyManager, HelmDependencyManager} from '../src/core/dependency_managers/index.js';
import {sleep} from '../src/core/helpers.js';
import {AccountBalanceQuery, AccountCreateTransaction, Hbar, HbarUnit, PrivateKey} from '@hashgraph/sdk';
import {NODE_LOG_FAILURE_MSG, ROOT_CONTAINER, SOLO_LOGS_DIR} from '../src/core/constants.js';
import crypto from 'crypto';
import {AccountCommand} from '../src/commands/account.js';
import {SoloError} from '../src/core/errors.js';
import {execSync} from 'child_process';
import * as NodeCommandConfigs from '../src/commands/node/configs.js';
import type {SoloLogger} from '../src/core/logging.js';
import type {BaseCommand} from '../src/commands/base.js';
import type {NodeAlias} from '../src/types/aliases.js';
import type {NetworkNodeServices} from '../src/core/network_node_services.js';
import {K8} from '../src/core/k8.js';
import {AccountManager} from '../src/core/account_manager.js';
import {PlatformInstaller} from '../src/core/platform_installer.js';
import {ProfileManager} from '../src/core/profile_manager.js';
import {LeaseManager} from '../src/core/lease/lease_manager.js';
import {CertificateManager} from '../src/core/certificate_manager.js';
import {LocalConfig} from '../src/core/config/local_config.js';
import {RemoteConfigManager} from '../src/core/config/remote/remote_config_manager.js';
import * as constants from '../src/core/constants.js';
import {Templates} from '../src/core/templates.js';
import {ConfigManager} from '../src/core/config_manager.js';
import * as logging from '../src/core/logging.js';
import {Helm} from '../src/core/helm.js';
import {ChartManager} from '../src/core/chart_manager.js';
import {PackageDownloader} from '../src/core/package_downloader.js';
import {KeyManager} from '../src/core/key_manager.js';
import {Zippy} from '../src/core/zippy.js';
import {HEDERA_PLATFORM_VERSION} from '../version.js';
import {IntervalLeaseRenewalService} from '../src/core/lease/interval_lease_renewal.js';
import {Duration} from '../src/core/time/duration.js';

export const testLogger = logging.NewLogger('debug', true);
export const TEST_CLUSTER = 'solo-e2e';
export const HEDERA_PLATFORM_VERSION_TAG = HEDERA_PLATFORM_VERSION;

export const BASE_TEST_DIR = path.join('test', 'data', 'tmp');

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
export function getDefaultArgv() {
  const argv: Record<string, any> = {};
  for (const f of flags.allFlags) {
    argv[f.name] = f.definition.defaultValue;
  }

  return argv;
}

interface TestOpts {
  logger: SoloLogger;
  helm: Helm;
  k8: K8;
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
  namespace: string;
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
  };
}

/** Initialize common test variables */
export function bootstrapTestVariables(
  testName: string,
  argv: any,
  k8Arg: K8 | null = null,
  initCmdArg: InitCommand | null = null,
  clusterCmdArg: ClusterCommand | null = null,
  networkCmdArg: NetworkCommand | null = null,
  nodeCmdArg: NodeCommand | null = null,
  accountCmdArg: AccountCommand | null = null,
): BootstrapResponse {
  const namespace: string = argv[flags.namespace.name] || 'bootstrap-ns';
  const cacheDir: string = argv[flags.cacheDir.name] || getTestCacheDir(testName);
  const configManager = new ConfigManager(testLogger);
  configManager.update(argv);
  const downloader = new PackageDownloader(testLogger);
  const zippy = new Zippy(testLogger);
  const helmDepManager = new HelmDependencyManager(downloader, zippy, testLogger);
  const depManagerMap = new Map<string, HelmDependencyManager>().set(constants.HELM, helmDepManager);
  const depManager = new DependencyManager(testLogger, depManagerMap);
  const keyManager = new KeyManager(testLogger);
  const helm = new Helm(testLogger);
  const chartManager = new ChartManager(helm, testLogger);
  const k8 = k8Arg || new K8(configManager, testLogger);
  const accountManager = new AccountManager(testLogger, k8);
  const platformInstaller = new PlatformInstaller(testLogger, k8, configManager);
  const profileManager = new ProfileManager(testLogger, configManager);
  const leaseManager = new LeaseManager(k8, configManager, testLogger, new IntervalLeaseRenewalService());
  const certificateManager = new CertificateManager(k8, testLogger, configManager);
  const localConfig = new LocalConfig(path.join(BASE_TEST_DIR, 'local-config.yaml'), testLogger, configManager);
  const remoteConfigManager = new RemoteConfigManager(k8, testLogger, localConfig, configManager);

  const opts: TestOpts = {
    logger: testLogger,
    helm,
    k8,
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

  const initCmd = initCmdArg || new InitCommand(opts);
  const clusterCmd = clusterCmdArg || new ClusterCommand(opts);
  const networkCmd = networkCmdArg || new NetworkCommand(opts);
  const nodeCmd = nodeCmdArg || new NodeCommand(opts);
  const accountCmd = accountCmdArg || new AccountCommand(opts, constants.SHORTER_SYSTEM_ACCOUNTS);
  return {
    namespace,
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
    },
  };
}

/** Bootstrap network in a given namespace, then run the test call back providing the bootstrap response */
export function e2eTestSuite(
  testName: string,
  argv: Record<any, any>,
  k8Arg: K8 | null = null,
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
    k8Arg,
    initCmdArg,
    clusterCmdArg,
    networkCmdArg,
    nodeCmdArg,
    accountCmdArg,
  );
  const namespace = bootstrapResp.namespace;
  const initCmd = bootstrapResp.cmd.initCmd;
  const k8 = bootstrapResp.opts.k8;
  const clusterCmd = bootstrapResp.cmd.clusterCmd;
  const networkCmd = bootstrapResp.cmd.networkCmd;
  const nodeCmd = bootstrapResp.cmd.nodeCmd;
  const chartManager = bootstrapResp.opts.chartManager;

  describe(`E2E Test Suite for '${testName}'`, function () {
    this.bail(true); // stop on first failure, nothing else will matter if network doesn't come up correctly

    describe(`Bootstrap network for test [release ${argv[flags.releaseTag.name]}}]`, () => {
      before(() => {
        bootstrapResp.opts.logger.showUser(
          `------------------------- START: bootstrap (${testName}) ----------------------------`,
        );
      });

      after(async function () {
        this.timeout(Duration.ofMinutes(5).toMillis());
        await k8.getNodeLogs(namespace);
        bootstrapResp.opts.logger.showUser(
          `------------------------- END: bootstrap (${testName}) ----------------------------`,
        );
      });

      it('should cleanup previous deployment', async () => {
        await initCmd.init(argv);

        if (await k8.hasNamespace(namespace)) {
          await k8.deleteNamespace(namespace);

          while (await k8.hasNamespace(namespace)) {
            testLogger.debug(`Namespace ${namespace} still exist. Waiting...`);
            await sleep(Duration.ofSeconds(2));
          }
        }

        if (
          !(await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
        ) {
          await clusterCmd.setup(argv);
        }
      }).timeout(Duration.ofMinutes(2).toMillis());

      it('generate key files', async () => {
        expect(await nodeCmd.handlers.keys(argv)).to.be.true;
        expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.KEYS_CONFIGS_NAME)).to.deep.equal([
          flags.devMode.constName,
          flags.quiet.constName,
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
          flags.profileFile.constName,
          flags.profileName.constName,
          flags.quiet.constName,
          flags.settingTxt.constName,
          flags.grpcTlsKeyPath.constName,
          flags.grpcWebTlsKeyPath.constName,
        ]);
      }).timeout(Duration.ofMinutes(5).toMillis());

      if (startNodes) {
        it('should succeed with node setup command', async () => {
          // cache this, because `solo node setup.finalize()` will reset it to false
          try {
            expect(await nodeCmd.handlers.setup(argv)).to.be.true;
            expect(nodeCmd.getUnusedConfigs(NodeCommandConfigs.SETUP_CONFIGS_NAME)).to.deep.equal([
              flags.devMode.constName,
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

export function balanceQueryShouldSucceed(accountManager: AccountManager, cmd: BaseCommand, namespace: string) {
  it('Balance query should succeed', async () => {
    try {
      expect(accountManager._nodeClient).to.be.null;
      await accountManager.loadNodeClient(namespace);
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

export function accountCreationShouldSucceed(accountManager: AccountManager, nodeCmd: BaseCommand, namespace: string) {
  it('Account creation should succeed', async () => {
    try {
      await accountManager.loadNodeClient(namespace);
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
  namespace: string,
  k8: K8,
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
      k8,
      nodeAlias,
      dataKeysDir,
      uniqueNodeDestDir,
      keyHashMap,
      Templates.renderGossipPemPrivateKeyFile(nodeAlias),
    );
    await addKeyHashToMap(k8, nodeAlias, tlsKeysDir, uniqueNodeDestDir, keyHashMap, 'hedera.key');
    nodeKeyHashMap.set(nodeAlias, keyHashMap);
  }
  return nodeKeyHashMap;
}

async function addKeyHashToMap(
  k8: K8,
  nodeAlias: NodeAlias,
  keyDir: string,
  uniqueNodeDestDir: string,
  keyHashMap: Map<string, string>,
  privateKeyFileName: string,
) {
  await k8.copyFrom(
    Templates.renderNetworkPodName(nodeAlias),
    ROOT_CONTAINER,
    path.join(keyDir, privateKeyFileName),
    uniqueNodeDestDir,
  );
  const keyBytes = fs.readFileSync(path.join(uniqueNodeDestDir, privateKeyFileName));
  const keyString = keyBytes.toString();
  keyHashMap.set(privateKeyFileName, crypto.createHash('sha256').update(keyString).digest('base64'));
}

export function getK8Instance(configManager: ConfigManager) {
  try {
    return new K8(configManager, testLogger);
    // TODO: return a mock without running the init within constructor after we convert to Mocha, Jest ESModule mocks are broke.
  } catch (e) {
    if (!(e instanceof SoloError)) {
      throw e;
    }

    // Set envs
    process.env.SOLO_CLUSTER_NAME = 'solo-e2e';
    process.env.SOLO_NAMESPACE = 'solo-e2e';
    process.env.SOLO_CLUSTER_SETUP_NAMESPACE = 'solo-setup';

    // Create cluster
    execSync(`kind create cluster --name "${process.env.SOLO_CLUSTER_NAME}"`, {stdio: 'inherit'});
    return new K8(configManager, testLogger);
  }
}

export const testLocalConfigData = {
  userEmailAddress: 'john.doe@example.com',
  deployments: {
    deployment: {
      clusters: ['cluster-1'],
    },
    'deployment-2': {
      clusters: ['cluster-2'],
    },
    'deployment-3': {
      clusters: ['cluster-3'],
    },
  },
  currentDeploymentName: 'deployment',
};
