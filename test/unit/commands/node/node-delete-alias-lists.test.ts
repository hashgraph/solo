// SPDX-License-Identifier: Apache-2.0

import {describe, it} from 'mocha';
import {expect} from 'chai';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeDestroyContext} from '../../../../src/commands/node/config-interfaces/node-destroy-context.js';
import {type NodeAlias} from '../../../../src/types/aliases.js';
import {type ConsensusNode} from '../../../../src/core/model/consensus-node.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';

type DestroyTask = (context_: NodeDestroyContext, task?: unknown) => Promise<unknown> | void;

const DELETED_ALIAS: NodeAlias = 'node1' as NodeAlias;
const REMAINING_ALIASES: NodeAlias[] = ['node2', 'node3'] as NodeAlias[];
const EXISTING_ALIASES: NodeAlias[] = [DELETED_ALIAS, ...REMAINING_ALIASES];

function buildDestroyContext(): NodeDestroyContext {
  return {
    config: {
      namespace: NamespaceName.of('solo'),
      nodeAlias: DELETED_ALIAS,
      existingNodeAliases: [...EXISTING_ALIASES],
      allNodeAliases: [...EXISTING_ALIASES],
      nodeAliases: [...EXISTING_ALIASES],
      consensusNodes: EXISTING_ALIASES.map(
        (name: NodeAlias): ConsensusNode => ({name, context: 'context-1'}) as unknown as ConsensusNode,
      ),
      podRefs: Object.fromEntries(
        EXISTING_ALIASES.map((name: NodeAlias): [NodeAlias, PodReference] => [
          name,
          PodReference.of(NamespaceName.of('solo'), PodName.of(`network-${name}-0`)),
        ]),
      ),
    },
  } as unknown as NodeDestroyContext;
}

describe('NodeCommandTasks node delete alias lists', (): void => {
  it('excludes the deleted alias from every alias list used by the tasks after the chart update', async (): Promise<void> => {
    const removedComponents: {id: unknown; type: ComponentTypes}[] = [];
    let persistCallCount: number = 0;

    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    (nodeCommandTasks as unknown as {remoteConfig: unknown}).remoteConfig = {
      configuration: {
        components: {
          removeComponent: (id: unknown, type: ComponentTypes): void => {
            removedComponents.push({id, type});
          },
        },
      },
      persist: async (): Promise<void> => {
        persistCallCount++;
      },
    };

    const context: NodeDestroyContext = buildDestroyContext();

    // same order as the delete flow: refreshNodeList runs before removeNodeFromRemoteConfig
    await (nodeCommandTasks.refreshNodeList().task as DestroyTask)(context);
    await (nodeCommandTasks.removeNodeFromRemoteConfig().task as DestroyTask)(context);

    expect(context.config.allNodeAliases).to.deep.equal(REMAINING_ALIASES);
    expect(context.config.nodeAliases).to.deep.equal(REMAINING_ALIASES);
    expect(context.config.refreshedConsensusNodes.map((node: ConsensusNode): string => node.name)).to.deep.equal(
      REMAINING_ALIASES,
    );
    expect(
      removedComponents.map((component: {type: ComponentTypes}): ComponentTypes => component.type),
    ).to.have.members([ComponentTypes.ConsensusNode, ComponentTypes.EnvoyProxy, ComponentTypes.HaProxy]);
    expect(persistCallCount).to.equal(1);
  });

  it('copies the config map files only to the nodes that remain after the delete', async (): Promise<void> => {
    const copiedToPods: string[] = [];

    const nodeCommandTasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;
    (nodeCommandTasks as unknown as {k8Factory: unknown}).k8Factory = {
      getK8: (): unknown => ({
        configMaps: (): unknown => ({
          read: async (): Promise<unknown> => ({data: {'application.properties': 'hedera.config.version=1'}}),
        }),
      }),
    };
    (nodeCommandTasks as unknown as {platformInstaller: unknown}).platformInstaller = {
      copyFiles: async (podReference: PodReference): Promise<string[]> => {
        copiedToPods.push(podReference.name.toString());
        return [];
      },
    };

    const context: NodeDestroyContext = buildDestroyContext();
    await (nodeCommandTasks.refreshNodeList().task as DestroyTask)(context);

    const subTasks: {task: () => Promise<void>}[] = [];
    await (nodeCommandTasks.copyConfigMapFilesToNodes().task as DestroyTask)(context, {
      newListr: (tasks: {task: () => Promise<void>}[]): unknown => {
        subTasks.push(...tasks);
        return undefined;
      },
    });
    for (const subTask of subTasks) {
      await subTask.task();
    }

    expect(copiedToPods).to.have.members(['network-node2-0', 'network-node3-0']);
    expect(copiedToPods).to.not.include('network-node1-0');
  });
});
