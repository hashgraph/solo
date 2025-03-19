// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {it, describe, after, before, afterEach, beforeEach} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {bootstrapTestVariables, getTestCluster, getTestCacheDir, HEDERA_PLATFORM_VERSION_TAG} from '../../test-util.js';
import * as constants from '../../../src/core/constants.js';
import * as logging from '../../../src/core/logging.js';
import {sleep} from '../../../src/core/helpers.js';
import * as version from '../../../version.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace-name.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import * as fs from 'node:fs';
import * as yaml from 'yaml';
import {PathEx} from '../../../src/business/utils/path-ex.js';

describe('ClusterCommand', () => {
  // mock showUser and showJSON to silent logging during tests
  before(() => {
    sinon.stub(logging.SoloLogger.prototype, 'showUser');
    sinon.stub(logging.SoloLogger.prototype, 'showJSON');
  });

  after(() => {
    // @ts-expect-error: TS2339 - to restore
    logging.SoloLogger.prototype.showUser.restore();
    // @ts-expect-error: TS2339 - to restore
    logging.SoloLogger.prototype.showJSON.restore();
  });

  const TEST_CONTEXT = getTestCluster();
  const TEST_CLUSTER = getTestCluster();
  const testName = 'cluster-cmd-e2e';
  const namespace = NamespaceName.of(testName);
  const argv = Argv.getDefaultArgv(namespace);
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
    cmd: {clusterCmd},
  } = bootstrapTestVariables(testName, argv, {});

  after(async function () {
    this.timeout(Duration.ofMinutes(3).toMillis());

    await k8Factory.default().namespaces().delete(namespace);
    argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);
    configManager.update(argv.build());
    await clusterCmd.handlers.setup(argv.build()); // restore solo-cluster-setup for other e2e tests to leverage
    do {
      await sleep(Duration.ofSeconds(5));
    } while (
      !(await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART))
    );
  });

  beforeEach(() => {
    configManager.reset();
  });

  // give a few ticks so that connections can close
  afterEach(async () => await sleep(Duration.ofMillis(5)));

  it('should cleanup existing deployment', async () => {
    if (await chartManager.isChartInstalled(constants.SOLO_SETUP_NAMESPACE, constants.SOLO_CLUSTER_SETUP_CHART)) {
      expect(await clusterCmd.handlers.reset(argv.build())).to.be.true;
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv.setArg(flags.clusterSetupNamespace, 'INVALID');
    await expect(clusterCmd.handlers.setup(argv.build())).to.be.rejectedWith('Error on cluster setup');
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should work with valid args', async () => {
    argv.setArg(flags.clusterSetupNamespace, namespace.name);
    expect(await clusterCmd.handlers.setup(argv.build())).to.be.true;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('cluster-ref connect should pass with correct data', async () => {
    const {argv, clusterRef, contextName} = getClusterConnectDefaultArgv();

    await clusterCmd.handlers.connect(argv.build());

    const localConfigPath = PathEx.joinWithRealPath(getTestCacheDir(), constants.DEFAULT_LOCAL_CONFIG_FILE);
    const localConfigYaml = fs.readFileSync(localConfigPath).toString();
    const localConfigData = yaml.parse(localConfigYaml);

    expect(localConfigData.clusterRefs).to.have.own.property(clusterRef);
    expect(localConfigData.clusterRefs[clusterRef]).to.equal(contextName);
  });

  it('solo cluster info should work', () => {
    expect(clusterCmd.handlers.info(argv.build())).to.be.ok;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster list', async () => {
    expect(clusterCmd.handlers.list(argv.build())).to.be.ok;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('function showInstalledChartList should return right true', async () => {
    // @ts-expect-error - TS2341: to access private property
    await expect(clusterCmd.handlers.tasks.showInstalledChartList()).to.eventually.be.undefined;
  }).timeout(Duration.ofMinutes(1).toMillis());

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv.setArg(flags.clusterSetupNamespace, 'INVALID');

    try {
      await clusterCmd.handlers.reset(argv.build());
      expect.fail();
    } catch (e) {
      console.error(e.message);
      expect(e.message).to.include('Error on cluster reset');
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster reset should work with valid args', async () => {
    argv.setArg(flags.clusterSetupNamespace, namespace.name);
    expect(await clusterCmd.handlers.reset(argv.build())).to.be.true;
  }).timeout(Duration.ofMinutes(1).toMillis());

  // 'solo cluster-ref connect' tests
  function getClusterConnectDefaultArgv(): {argv: Argv; clusterRef: string; contextName: string} {
    const clusterRef = TEST_CLUSTER;
    const contextName = TEST_CONTEXT;

    const argv = Argv.initializeEmpty();
    argv.setArg(flags.clusterRef, clusterRef);
    argv.setArg(flags.quiet, true);
    argv.setArg(flags.context, contextName);
    argv.setArg(flags.userEmailAddress, 'test@test.com');
    return {argv, clusterRef, contextName};
  }

  it('cluster-ref connect should fail with cluster ref that already exists', async () => {
    const clusterRef = 'duplicated';
    const {argv} = getClusterConnectDefaultArgv();
    argv.setArg(flags.clusterRef, clusterRef);

    try {
      await clusterCmd.handlers.connect(argv.build());
      await clusterCmd.handlers.connect(argv.build());
      expect.fail();
    } catch (e) {
      expect(e.message).to.include(`Cluster ref ${clusterRef} already exists inside local config`);
    }
  });

  it('cluster-ref connect should fail with invalid context name', async () => {
    const clusterRef = 'test-context-name';
    const contextName = 'INVALID_CONTEXT';
    const {argv} = getClusterConnectDefaultArgv();
    argv.setArg(flags.clusterRef, clusterRef);
    argv.setArg(flags.context, contextName);

    try {
      await clusterCmd.handlers.connect(argv.build());
      expect.fail();
    } catch (e) {
      expect(e.message).to.include(`Context ${contextName} is not valid for cluster test-context-name`);
    }
  });
});
