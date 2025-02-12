/**
 * SPDX-License-Identifier: Apache-2.0
 */
import sinon from 'sinon';
import {it, describe, after, before, afterEach, beforeEach} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {bootstrapTestVariables, getDefaultArgv, HEDERA_PLATFORM_VERSION_TAG, TEST_CLUSTER} from '../../test_util.js';
import * as constants from '../../../src/core/constants.js';
import * as logging from '../../../src/core/logging.js';
import {sleep} from '../../../src/core/helpers.js';
import * as version from '../../../version.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';

import {NamespaceNameInvalidError} from '../../../src/core/kube/errors/namespace_name_invalid_error.js';

describe('ClusterCommand', () => {
  // mock showUser and showJSON to silent logging during tests
  before(() => {
    sinon.stub(logging.SoloLogger.prototype, 'showUser');
    sinon.stub(logging.SoloLogger.prototype, 'showJSON');
  });

  after(() => {
    // @ts-ignore
    logging.SoloLogger.prototype.showUser.restore();
    // @ts-ignore
    logging.SoloLogger.prototype.showJSON.restore();
  });

  const testName = 'cluster-cmd-e2e';
  const namespace = NamespaceName.of(testName);
  const argv = getDefaultArgv();
  argv[flags.namespace.name] = namespace.name;
  argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE.name;
  argv[flags.releaseTag.name] = HEDERA_PLATFORM_VERSION_TAG;
  argv[flags.nodeAliasesUnparsed.name] = 'node1';
  argv[flags.generateGossipKeys.name] = true;
  argv[flags.generateTlsKeys.name] = true;
  argv[flags.clusterRef.name] = TEST_CLUSTER;
  argv[flags.soloChartVersion.name] = version.SOLO_CHART_VERSION;
  argv[flags.force.name] = true;
  // set the env variable SOLO_CHARTS_DIR if developer wants to use local Solo charts
  argv[flags.chartDirectory.name] = process.env.SOLO_CHARTS_DIR ?? undefined;

  const bootstrapResp = bootstrapTestVariables(testName, argv);
  const k8Factory = bootstrapResp.opts.k8Factory;
  const configManager = bootstrapResp.opts.configManager;
  const chartManager = bootstrapResp.opts.chartManager;

  const clusterCmd = bootstrapResp.cmd.clusterCmd;

  after(async function () {
    this.timeout(Duration.ofMinutes(3).toMillis());

    await k8Factory.default().namespaces().delete(namespace);
    argv[flags.clusterSetupNamespace.name] = constants.SOLO_SETUP_NAMESPACE.name;
    configManager.update(argv);
    await clusterCmd.handlers.setup(argv); // restore solo-cluster-setup for other e2e tests to leverage
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
      expect(await clusterCmd.handlers.reset(argv)).to.be.true;
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID';
    await expect(clusterCmd.handlers.setup(argv)).to.be.rejectedWith('Error on cluster setup');
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace.name;
    expect(await clusterCmd.handlers.setup(argv)).to.be.true;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster info should work', () => {
    expect(clusterCmd.handlers.info(argv)).to.be.ok;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster list', async () => {
    expect(clusterCmd.handlers.list(argv)).to.be.ok;
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('function showInstalledChartList should return right true', async () => {
    // @ts-ignore
    await expect(clusterCmd.handlers.tasks.showInstalledChartList()).to.eventually.be.undefined;
  }).timeout(Duration.ofMinutes(1).toMillis());

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv[flags.clusterSetupNamespace.name] = 'INVALID';

    try {
      await expect(clusterCmd.handlers.reset(argv)).to.be.rejectedWith('Error on cluster reset');
    } catch (e) {
      clusterCmd.logger.showUserError(e);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster reset should work with valid args', async () => {
    argv[flags.clusterSetupNamespace.name] = namespace.name;
    expect(await clusterCmd.handlers.reset(argv)).to.be.true;
  }).timeout(Duration.ofMinutes(1).toMillis());
});
