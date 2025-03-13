// SPDX-License-Identifier: Apache-2.0

import {after, before, describe, it} from 'mocha';
import {expect} from 'chai';

import {bootstrapTestVariables, getTmpDir, HEDERA_PLATFORM_VERSION_TAG} from '../../test_util.js';
import * as constants from '../../../src/core/constants.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import path from 'path';
import fs from 'fs';
import {Flags as flags} from '../../../src/commands/flags.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/core/kube/resources/namespace/namespace_name.js';
import {PodName} from '../../../src/core/kube/resources/pod/pod_name.js';
import {PodRef} from '../../../src/core/kube/resources/pod/pod_ref.js';
import {Argv} from '../../helpers/argv_wrapper.js';
import {NodeCommand} from '../../../src/commands/node/index.js';
import {InitCommand} from '../../../src/commands/init.js';
import {ClusterCommand} from '../../../src/commands/cluster/index.js';
import {DeploymentCommand} from '../../../src/commands/deployment.js';
import {NetworkCommand} from '../../../src/commands/network.js';

describe('NetworkCommand', function networkCommand() {
  this.bail(true);
  const testName = 'network-cmd-e2e';
  const namespace = NamespaceName.of(testName);
  const applicationEnvFileContents = '# row 1\n# row 2\n# row 3';
  const applicationEnvParentDirectory = path.join(getTmpDir(), 'network-command-test');
  const applicationEnvFilePath = path.join(applicationEnvParentDirectory, 'application.env');

  const argv = Argv.getDefaultArgv(namespace);
  argv.setArg(flags.namespace, namespace.name);
  argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
  argv.setArg(flags.nodeAliasesUnparsed, 'node1');
  argv.setArg(flags.generateGossipKeys, true);
  argv.setArg(flags.generateTlsKeys, true);
  argv.setArg(flags.deployMinio, true);
  argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
  argv.setArg(flags.force, true);
  argv.setArg(flags.applicationEnv, applicationEnvFilePath);
  argv.setArg(flags.loadBalancerEnabled, true);

  const {
    opts: {k8Factory, accountManager, configManager, chartManager, commandInvoker, logger},
    cmd: {networkCmd, clusterCmd, initCmd, nodeCmd, deploymentCmd},
  } = bootstrapTestVariables(testName, argv, {});

  after(async function () {
    this.timeout(Duration.ofMinutes(3).toMillis());

    // await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
    // await k8Factory.default().namespaces().delete(namespace);
    // await accountManager.close();
  });

  before(async () => {
    await k8Factory.default().namespaces().delete(namespace);

    await commandInvoker.invoke({
      argv: argv,
      command: InitCommand.COMMAND_NAME,
      subcommand: 'init',
      callback: async argv => initCmd.init(argv),
    });

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'setup',
      callback: async argv => clusterCmd.handlers.setup(argv),
    });

    await commandInvoker.invoke({
      argv: argv,
      command: ClusterCommand.COMMAND_NAME,
      subcommand: 'connect',
      callback: async argv => clusterCmd.handlers.connect(argv),
    });

    fs.mkdirSync(applicationEnvParentDirectory, {recursive: true});
    fs.writeFileSync(applicationEnvFilePath, applicationEnvFileContents);
  });

  it('deployment create should succeed', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: DeploymentCommand.COMMAND_NAME,
      subcommand: 'create',
      callback: async argv => deploymentCmd.create(argv),
    });

    argv.setArg(flags.nodeAliasesUnparsed, undefined);
    configManager.reset();
    configManager.update(argv.build());
  });

  it('deployment create should succeed', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: DeploymentCommand.COMMAND_NAME,
      subcommand: 'add-cluster',
      callback: async argv => deploymentCmd.addCluster(argv),
    });

    argv.setArg(flags.nodeAliasesUnparsed, undefined);
    configManager.reset();
    configManager.update(argv.build());
  });

  it('keys should be generated', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: NodeCommand.COMMAND_NAME,
      subcommand: 'keys',
      callback: async argv => nodeCmd.handlers.keys(argv),
    });
  });

  it('network deploy command should succeed', async () => {
    await commandInvoker.invoke({
      argv: argv,
      command: NetworkCommand.COMMAND_NAME,
      subcommand: 'deploy',
      callback: async argv => networkCmd.deploy(argv),
    });

    // check pod names should match expected values
    await expect(
      k8Factory
        .default()
        .pods()
        .read(PodRef.of(namespace, PodName.of('network-node1-0'))),
    ).eventually.to.have.nested.property('podRef.name.name', 'network-node1-0');
    // get list of pvc using k8 pvcs list function and print to log
    const pvcs = await k8Factory.default().pvcs().list(namespace, []);
    logger.showList('PVCs', pvcs);
  }).timeout(Duration.ofMinutes(4).toMillis());

  it('application env file contents should be in cached values file', () => {
    // @ts-expect-error - TS2341: to access private property
    const valuesYaml = fs.readFileSync(networkCmd.profileValuesFile).toString();
    const fileRows = applicationEnvFileContents.split('\n');
    for (const fileRow of fileRows) {
      expect(valuesYaml).to.contain(fileRow);
    }
  });

  it('network destroy should success', async () => {
    argv.setArg(flags.deletePvcs, true);
    argv.setArg(flags.deleteSecrets, true);
    argv.setArg(flags.force, true);
    configManager.update(argv.build());

    try {
      await commandInvoker.invoke({
        argv: argv,
        command: NetworkCommand.COMMAND_NAME,
        subcommand: 'destroy',
        callback: async argv => networkCmd.destroy(argv),
      });

      while ((await k8Factory.default().pods().list(namespace, ['solo.hedera.com/type=network-node'])).length > 0) {
        logger.debug('Pods are still running. Waiting...');
        await sleep(Duration.ofSeconds(3));
      }

      while ((await k8Factory.default().pods().list(namespace, ['app=minio'])).length > 0) {
        logger.showUser('Waiting for minio container to be deleted...');
        await sleep(Duration.ofSeconds(3));
      }

      // check if chart is uninstalled
      const chartInstalledStatus = await chartManager.isChartInstalled(namespace, constants.SOLO_DEPLOYMENT_CHART);
      expect(chartInstalledStatus).to.be.false;

      // check if pvc are deleted
      await expect(k8Factory.default().pvcs().list(namespace, [])).eventually.to.have.lengthOf(0);

      // check if secrets are deleted
      await expect(k8Factory.default().secrets().list(namespace)).eventually.to.have.lengthOf(0);
    } catch (e) {
      logger.showUserError(e);
      expect.fail();
    }
  }).timeout(Duration.ofMinutes(2).toMillis());
});
