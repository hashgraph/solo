// SPDX-License-Identifier: Apache-2.0

import {after, afterEach, describe} from 'mocha';
import {expect} from 'chai';

import {Flags as flags} from '../../../src/commands/flags.js';
import {endToEndTestSuite, getTestCluster, HEDERA_PLATFORM_VERSION_TAG, startNodesTest} from '../../test-utility.js';
import * as version from '../../../version.js';
import {sleep} from '../../../src/core/helpers.js';
import {Duration} from '../../../src/core/time/duration.js';
import {NamespaceName} from '../../../src/integration/kube/resources/namespace/namespace-name.js';
import {type NetworkNodes} from '../../../src/core/network-nodes.js';
import {container} from 'tsyringe-neo';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {BlockNodeCommand} from '../../../src/commands/block-node.js';
import {ComponentTypes} from '../../../src/core/config/remote/enumerations/component-types.js';
import {ComponentNameTemplates} from '../../../src/core/config/remote/components/component-name-templates.js';
import {type ClusterReference, type ComponentName} from '../../../src/core/config/remote/types.js';
import {type BlockNodeComponent} from '../../../src/core/config/remote/components/block-node-component.js';
import {ComponentStates} from '../../../src/core/config/remote/enumerations/component-states.js';
import {type RemoteConfigManager} from '../../../src/core/config/remote/remote-config-manager.js';

const testName: string = 'block-node-cmd-e2e';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const clusterReference: ClusterReference = getTestCluster();
argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.releaseTag, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, clusterReference);
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);

function testBlockNodeComponent(
  index: number,
  remoteConfigManager: RemoteConfigManager,
  expectedState: ComponentStates,
): void {
  const componentName: ComponentName = ComponentNameTemplates.renderBlockNodeName(index);
  const component: BlockNodeComponent = remoteConfigManager.components.getComponent(
    ComponentTypes.BlockNode,
    componentName,
  );

  expect(component.name).to.equal(componentName);
  expect(component.state).to.equal(expectedState);
  expect(component.namespace).to.equal(namespace.name);
  expect(component.cluster).to.equal(clusterReference);
}

endToEndTestSuite(testName, argv, {startNodes: false, deployNetwork: false}, bootstrapResp => {
  const {
    opts: {k8Factory, commandInvoker, remoteConfigManager, configManager},
    cmd: {nodeCmd},
  } = bootstrapResp;

  describe('BlockNodeCommand', async () => {
    const blockNodeCommand: BlockNodeCommand = new BlockNodeCommand(bootstrapResp.opts);

    after(async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());
      await container.resolve<NetworkNodes>(InjectTokens.NetworkNodes).getLogs(namespace);
      await k8Factory.default().namespaces().delete(namespace);
    });

    afterEach(async () => await sleep(Duration.ofMillis(5)));

    it("Should succeed deploying block node with 'add' command", async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());

      await commandInvoker.invoke({
        argv: argv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node add',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.add(argv),
      });

      testBlockNodeComponent(0, remoteConfigManager, ComponentStates.ACTIVE);
    });

    it("Should succeed deploying block node with multiple 'add' command", async function () {
      this.timeout(Duration.ofMinutes(5).toMillis());

      configManager.reset();

      await commandInvoker.invoke({
        argv: argv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node add',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.add(argv),
      });

      testBlockNodeComponent(0, remoteConfigManager, ComponentStates.ACTIVE);
      testBlockNodeComponent(1, remoteConfigManager, ComponentStates.ACTIVE);
    });

    startNodesTest(argv, commandInvoker, nodeCmd);

    it("Should succeed with removing block node with 'destroy' command", async function () {
      this.timeout(Duration.ofMinutes(2).toMillis());

      configManager.reset();

      const destroyArgv: Argv = argv.clone();
      destroyArgv.setArg(flags.blockNodeId, 0); // to select the first block node

      await commandInvoker.invoke({
        argv: destroyArgv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node destroy',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.destroy(argv),
      });

      testBlockNodeComponent(0, remoteConfigManager, ComponentStates.DELETED);
      testBlockNodeComponent(1, remoteConfigManager, ComponentStates.ACTIVE);
    });

    it("Should succeed with removing all block nodes with 'destroy' command", async function () {
      this.timeout(Duration.ofMinutes(2).toMillis());

      configManager.reset();

      const destroyArgv: Argv = argv.clone();
      destroyArgv.setArg(flags.blockNodeId, 1); // to select the second block node

      await commandInvoker.invoke({
        argv: destroyArgv,
        command: BlockNodeCommand.COMMAND_NAME,
        subcommand: 'node destroy',
        // @ts-expect-error to access private property
        callback: async argv => blockNodeCommand.destroy(argv),
      });

      testBlockNodeComponent(0, remoteConfigManager, ComponentStates.DELETED);
      testBlockNodeComponent(1, remoteConfigManager, ComponentStates.DELETED);
    });
  });
});
