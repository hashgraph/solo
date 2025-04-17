// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {it, describe, after, before, afterEach, beforeEach} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {
  bootstrapTestVariables,
  getTestCluster,
  getTestCacheDirectory,
  HEDERA_PLATFORM_VERSION_TAG,
} from '../../test-utility.js';
import * as constants from '../../../src/core/constants.js';
import {sleep} from '../../../src/core/helpers.js';
import * as version from '../../../version.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import * as fs from 'node:fs';
import * as yaml from 'yaml';
import {PathEx} from '../../../src/business/utils/path-ex.js';
import {SoloWinstonLogger} from '../../../src/core/logging/solo-winston-logger.js';
import {resetForTest} from '../../test-container.js';
import {DEFAULT_LOCAL_CONFIG_FILE} from '../../../src/core/constants.js';
import {container} from 'tsyringe-neo';
import {ClusterCommandHandlers} from '../../../src/commands/cluster/handlers.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';

describe('ClusterCommand', () => {
  // mock showUser and showJSON to silent logging during tests
  before(() => {
    sinon.stub(SoloWinstonLogger.prototype, 'showUser');
    sinon.stub(SoloWinstonLogger.prototype, 'showJSON');
    fs.unlinkSync(PathEx.joinWithRealPath(getTestCacheDirectory(), DEFAULT_LOCAL_CONFIG_FILE));
  });

  const TEST_CONTEXT = getTestCluster();
  const TEST_CLUSTER = getTestCluster();
  const testName = 'cluster-cmd-e2e';
  const namespace = NamespaceName.of(testName);
  const argv = Argv.getDefaultArgv(namespace);
  let clusterCmdHandlers: ClusterCommandHandlers;
  let clusterCmdTasks: ClusterCommandTasks;
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);
  argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.clusterRef, TEST_CLUSTER);
  argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
  argv.setArg(flags.force, true);
  const {
    opts: {k8Factory, configManager, chartManager, commandInvoker},
  } = bootstrapTestVariables(testName, argv, {});

  after(async function () {
    // @ts-expect-error: TS2339 - to restore
    SoloWinstonLogger.prototype.showUser.restore();
    // @ts-expect-error: TS2339 - to restore
    SoloWinstonLogger.prototype.showJSON.restore();

    this.timeout(Duration.ofMinutes(3).toMillis());

    await k8Factory.default().namespaces().delete(namespace);
    argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);
    configManager.update(argv.build());
    await clusterCmdHandlers.setup(argv.build()); // restore solo-cluster-setup for other e2e tests to leverage
    do {
      await sleep(Duration.ofSeconds(5));
    } while (
      !(await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
    );
  });

  beforeEach(() => {
    resetForTest(namespace.name);
    clusterCmdHandlers = container.resolve<ClusterCommandHandlers>(ClusterCommandHandlers);
    clusterCmdTasks = container.resolve<ClusterCommandTasks>(ClusterCommandTasks);
    configManager.reset();
  });

  // give a few ticks so that connections can close
  afterEach(async () => await sleep(Duration.ofMillis(5)));

  it('should cleanup existing deployment', async () => {
    if (await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART)) {
      expect(await clusterCmdHandlers.reset(argv.build())).to.be.true;
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv.setArg(flags.clusterSetupNamespace, 'INVALID');
    await expect(clusterCmdHandlers.setup(argv.build())).to.be.rejectedWith('Error on cluster setup');
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should work with valid args', async () => {
    argv.setArg(flags.clusterSetupNamespace, namespace.name);
    expect(await clusterCmdHandlers.setup(argv.build())).to.be.true;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('cluster-ref connect should pass with correct data', async () => {
    const {argv, clusterRef, contextName} = getClusterConnectDefaultArgv();

    const localConfigPath = PathEx.joinWithRealPath(getTestCacheDirectory(), constants.DEFAULT_LOCAL_CONFIG_FILE);

    await clusterCmdHandlers.connect(argv.build());

    const localConfigYaml = fs.readFileSync(localConfigPath).toString();
    const localConfigData = yaml.parse(localConfigYaml);

    expect(localConfigData.clusterRefs).to.have.own.property(clusterRef);
    expect(localConfigData.clusterRefs[clusterRef]).to.equal(contextName);
  });

  it('solo cluster info should work', () => {
    expect(clusterCmdHandlers.info(argv.build())).to.be.ok;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster list', async () => {
    expect(clusterCmdHandlers.list(argv.build())).to.be.ok;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('function showInstalledChartList should return right true', async () => {
    // @ts-expect-error TS2341: Property showInstalledChartList is private and only accessible within class ClusterCommandTasks
    await expect(clusterCmdTasks.showInstalledChartList()).to.eventually.be.undefined;
  }).timeout(Duration.ofMinutes(1).toMillis());

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv.setArg(flags.clusterSetupNamespace, 'INVALID');

    try {
      await clusterCmdHandlers.reset(argv.build());
      expect.fail();
    } catch (error) {
      console.error(error.message);
      expect(error.message).to.include('Error on cluster reset');
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster reset should work with valid args', async () => {
    argv.setArg(flags.clusterSetupNamespace, namespace.name);
    expect(await clusterCmdHandlers.reset(argv.build())).to.be.true;
  }).timeout(Duration.ofMinutes(1).toMillis());

  // 'solo cluster-ref connect' tests
  function getClusterConnectDefaultArgv(): {argv: Argv; clusterRef: string; contextName: string} {
    const clusterReference = TEST_CLUSTER;
    const contextName = TEST_CONTEXT;

    const argv = Argv.initializeEmpty();
    argv.setArg(flags.clusterRef, clusterReference);
    argv.setArg(flags.quiet, true);
    argv.setArg(flags.context, contextName);
    argv.setArg(flags.userEmailAddress, 'test@test.com');
    return {argv, clusterRef: clusterReference, contextName};
  }

  it('cluster-ref connect should fail with cluster ref that already exists', async () => {
    const clusterReference = 'duplicated';
    const {argv} = getClusterConnectDefaultArgv();
    argv.setArg(flags.clusterRef, clusterReference);

    try {
      await clusterCmdHandlers.connect(argv.build());
      await clusterCmdHandlers.connect(argv.build());
      expect.fail();
    } catch (error) {
      expect(error.message).to.include(`Cluster ref ${clusterReference} already exists inside local config`);
    }
  });

  it('cluster-ref connect should fail with invalid context name', async () => {
    const clusterReference = 'test-context-name';
    const contextName = 'INVALID_CONTEXT';
    const {argv} = getClusterConnectDefaultArgv();
    argv.setArg(flags.clusterRef, clusterReference);
    argv.setArg(flags.context, contextName);

    try {
      await clusterCmdHandlers.connect(argv.build());
      expect.fail();
    } catch (error) {
      expect(error.message).to.include(`Context ${contextName} is not valid for cluster test-context-name`);
    }
  });
});
