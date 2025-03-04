/**
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon';
import {beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';

import {ClusterCommand} from '../../../src/commands/cluster/index.js';
import {getTestCacheDir, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER, testLocalConfigData} from '../../test_util.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config_manager.js';
import {SoloLogger} from '../../../src/core/logging.js';
import {ChartManager} from '../../../src/core/chart_manager.js';
import {Helm} from '../../../src/core/helm.js';
import {ROOT_DIR} from '../../../src/core/constants.js';
import path from 'path';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test_container.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {type BaseCommand, type Opts} from '../../../src/commands/base.js';
import {LocalConfig} from '../../../src/core/config/local_config.js';
import {type CommandFlag} from '../../../src/types/flag_types.js';
import {K8Client} from '../../../src/core/kube/k8_client/k8_client.js';
import {K8ClientFactory} from '../../../src/core/kube/k8_client/k8_client_factory.js';
import {type Cluster, KubeConfig} from '@kubernetes/client-node';
import {RemoteConfigManager} from '../../../src/core/config/remote/remote_config_manager.js';
import {DependencyManager} from '../../../src/core/dependency_managers/index.js';
import {PackageDownloader} from '../../../src/core/package_downloader.js';
import {KeyManager} from '../../../src/core/key_manager.js';
import {AccountManager} from '../../../src/core/account_manager.js';
import {PlatformInstaller} from '../../../src/core/platform_installer.js';
import {ProfileManager} from '../../../src/core/profile_manager.js';
import {LeaseManager} from '../../../src/core/lease/lease_manager.js';
import {CertificateManager} from '../../../src/core/certificate_manager.js';
import {type ListrTaskWrapper} from 'listr2';
import fs from 'fs';
import {stringify} from 'yaml';
import {ErrorMessages} from '../../../src/core/error_messages.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {ClusterChecks} from '../../../src/core/cluster_checks.js';
import {K8ClientClusters} from '../../../src/core/kube/k8_client/resources/cluster/k8_client_clusters.js';
import {K8ClientContexts} from '../../../src/core/kube/k8_client/resources/context/k8_client_contexts.js';
import {InjectTokens} from '../../../src/core/dependency_injection/inject_tokens.js';
import {Argv} from '../../helpers/argv_wrapper.js';

const getBaseCommandOpts = (context: string) => {
  const opts = {
    logger: sandbox.createStubInstance(SoloLogger),
    helm: sandbox.createStubInstance(Helm),
    k8Factory: sandbox.createStubInstance(K8ClientFactory),
    chartManager: sandbox.createStubInstance(ChartManager),
    configManager: sandbox.createStubInstance(ConfigManager),
    depManager: sandbox.createStubInstance(DependencyManager),
    localConfig: sandbox.createStubInstance(LocalConfig),
  };
  opts.k8Factory.default.returns(new K8Client(context));
  return opts;
};

const testName = 'cluster-cmd-unit';
const namespace = NamespaceName.of(testName);
const argv = Argv.getDefaultArgv(namespace);
const sandbox = sinon.createSandbox();

argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, TEST_CLUSTER);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);

describe('ClusterCommand unit tests', () => {
  before(() => {
    resetForTest(namespace.name);
  });

  describe('Chart Install Function is called correctly', () => {
    let opts: any;

    afterEach(() => {
      sandbox.restore();
    });

    beforeEach(() => {
      const k8Client = new K8Client(undefined);
      const context = k8Client.contexts().readCurrent();
      opts = getBaseCommandOpts(context);
      opts.logger = container.resolve(InjectTokens.SoloLogger);
      opts.helm = container.resolve(InjectTokens.Helm);
      opts.chartManager = container.resolve(InjectTokens.ChartManager);
      opts.helm.dependency = sandbox.stub();

      opts.chartManager.isChartInstalled = sandbox.stub().returns(false);
      opts.chartManager.install = sandbox.stub().returns(true);

      opts.configManager = container.resolve(InjectTokens.ConfigManager);
      opts.remoteConfigManager = sandbox.stub();

      opts.remoteConfigManager.currentCluster = 'solo-e2e';
      opts.localConfig.clusterRefs = {'solo-e2e': 'context-1'};
    });
  });
});
