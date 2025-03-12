// SPDX-License-Identifier: Apache-2.0

import sinon from 'sinon';
import {it, describe, after, before, afterEach, beforeEach} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {bootstrapTestVariables, getTestCluster, getTestCacheDir, HEDERA_PLATFORM_VERSION_TAG} from '../../test_util.js';
import * as constants from '../../../src/core/constants.js';
import * as logging from '../../../src/core/logging.js';
import {sleep} from '../../../src/core/helpers.js';
import * as version from '../../../version.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {Argv} from '../../helpers/argv_wrapper.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as yaml from 'yaml';
import {ClusterCommand} from '../../../src/commands/cluster/index.js';

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
  argv.setArg(flags.clusterRef, getTestCluster());
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

    // restore solo-cluster-setup for other e2e tests to leverage
    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'setup',
      callback: async argv => clusterCmd.handlers.setup(argv),
    });

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
      await commandInvoker.invoke({
        argv: argv,
        command: ClusterCommand.COMMAND_NAME,
        subcommand: 'reset',
        callback: async argv => clusterCmd.handlers.reset(argv),
      });
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should fail with invalid cluster name', async () => {
    argv.setArg(flags.clusterSetupNamespace, 'INVALID');

    expect(
      commandInvoker.invoke({
        argv: argv,
        command: ClusterCommand.COMMAND_NAME,
        subcommand: 'setup',
        callback: async argv => clusterCmd.handlers.setup(argv),
      }),
    ).to.be.rejectedWith('Error on cluster setup');
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster setup should work with valid args', async () => {
    argv.setArg(flags.clusterSetupNamespace, namespace.name);

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'setup',
      callback: async argv => clusterCmd.handlers.setup(argv),
    });
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster info should work', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'info',
      callback: async argv => clusterCmd.handlers.info(argv),
    });
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster list', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'list',
      callback: async argv => clusterCmd.handlers.list(argv),
    });
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('function showInstalledChartList should return right true', async () => {
    // @ts-expect-error - TS2341: to access private property
    await expect(clusterCmd.handlers.tasks.showInstalledChartList()).to.eventually.be.undefined;
  }).timeout(Duration.ofMinutes(1).toMillis());

  // helm list would return an empty list if given invalid namespace
  it('solo cluster reset should fail with invalid cluster name', async () => {
    argv.setArg(flags.clusterSetupNamespace, 'INVALID');

    try {
      await expect(
        commandInvoker.invoke({
          argv: argv,
          command: ClusterCommand.COMMAND_NAME,
          subcommand: 'reset',
          callback: async argv => clusterCmd.handlers.reset(argv),
        }),
      ).to.be.rejectedWith('Error on cluster reset');
    } catch (e) {
      clusterCmd.logger.showUserError(e);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(1).toMillis());

  it('solo cluster reset should work with valid args', async () => {
    argv.setArg(flags.clusterSetupNamespace, namespace.name);

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'reset',
      callback: async argv => clusterCmd.handlers.reset(argv),
    });
  }).timeout(Duration.ofMinutes(1).toMillis());

  // 'solo cluster-ref connect' tests
  function getClusterConnectDefaultArgv(): {argv: Argv; clusterRef: string; contextName: string} {
    const clusterRef = TEST_CLUSTER;
    const contextName = TEST_CONTEXT;

    const argv = Argv.initializeEmpty();
    argv.setArg(flags.clusterRef, clusterRef);
    argv.setArg(flags.context, contextName);
    argv.setArg(flags.userEmailAddress, 'test@test.com');
    return {argv, clusterRef, contextName};
  }

  it('cluster-ref connect should pass with correct data', async () => {
    const {argv, clusterRef, contextName} = getClusterConnectDefaultArgv();

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'connect',
      callback: async argv => clusterCmd.handlers.connect(argv),
    });

    const localConfigPath = path.join(getTestCacheDir(), constants.DEFAULT_LOCAL_CONFIG_FILE);
    const localConfigYaml = fs.readFileSync(localConfigPath).toString();
    const localConfigData = yaml.parse(localConfigYaml);

    expect(localConfigData.clusterRefs).to.have.own.property(clusterRef);
    expect(localConfigData.clusterRefs[clusterRef]).to.equal(contextName);
  });

  it('cluster-ref connect should fail with cluster ref that already exists', async () => {
    const clusterRef = 'duplicated';
    const {argv} = getClusterConnectDefaultArgv();
    argv.setArg(flags.clusterRef, clusterRef);

    try {
      await commandInvoker.invoke({
        argv: argv,
        command: ClusterCommand.COMMAND_NAME,
        subcommand: 'connect',
        callback: async argv => clusterCmd.handlers.connect(argv),
      });

      await commandInvoker.invoke({
        argv: argv,
        command: ClusterCommand.COMMAND_NAME,
        subcommand: 'connect',
        callback: async argv => clusterCmd.handlers.connect(argv),
      });
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
      await commandInvoker.invoke({
        argv: argv,
        command: ClusterCommand.COMMAND_NAME,
        subcommand: 'connect',
        callback: async argv => clusterCmd.handlers.connect(argv),
      });

      await commandInvoker.invoke({
        argv: argv,
        command: ClusterCommand.COMMAND_NAME,
        subcommand: 'connect',
        callback: async argv => clusterCmd.handlers.connect(argv),
      });
      expect.fail();
    } catch (e) {
      expect(e.message).to.include(`Context ${contextName} is not valid for cluster test-context-name`);
    }
  });
});
