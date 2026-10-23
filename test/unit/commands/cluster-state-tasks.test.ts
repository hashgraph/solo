// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {ClusterStateService} from '../../../src/integration/container-engine/cluster-state-service.js';
import {type LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {StringFacade} from '../../../src/business/runtime-state/facade/string-facade.js';
import {type AnyListrContext} from '../../../src/types/aliases.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../src/types/index.js';
import {type KindClusterContainer} from '../../../src/integration/container-engine/kind-cluster-container.js';

const SOLO_CONTAINER: KindClusterContainer = {
  containerName: 'solo-e2e-control-plane',
  clusterName: 'solo-e2e',
  running: true,
};
const FOREIGN_CONTAINER: KindClusterContainer = {
  containerName: 'someone-elses-control-plane',
  clusterName: 'someone-elses',
  running: true,
};

const runTask: (task: SoloListrTask<AnyListrContext>) => Promise<void> = async (
  task: SoloListrTask<AnyListrContext>,
): Promise<void> => {
  await (task.task as (context_: AnyListrContext, wrapper: SoloListrTaskWrapper<AnyListrContext>) => Promise<void>)(
    {} as AnyListrContext,
    {} as SoloListrTaskWrapper<AnyListrContext>,
  );
};

const writeClusterReferences: (references: Record<string, string>) => Promise<void> = async (
  references: Record<string, string>,
): Promise<void> => {
  const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
  await localConfig.load();
  localConfig.configuration.clusterRefs.clear();
  for (const [clusterReference, context] of Object.entries(references)) {
    localConfig.configuration.clusterRefs.set(clusterReference, new StringFacade(context));
  }
  await localConfig.persist();
};

describe('ClusterCommandTasks state scoping', (): void => {
  let sandbox: SinonSandbox;
  let stopContainersStub: SinonStub;
  let tasks: ClusterCommandTasks;

  beforeEach((): void => {
    resetForTest();
    sandbox = sinon.createSandbox();

    sandbox.stub(ClusterStateService.prototype, 'getEngineState').resolves({engineName: 'docker', running: true});
    sandbox
      .stub(ClusterStateService.prototype, 'listKindClusterContainers')
      .resolves([SOLO_CONTAINER, FOREIGN_CONTAINER]);
    stopContainersStub = sandbox.stub(ClusterStateService.prototype, 'stopContainers').resolves();

    tasks = container.resolve(ClusterCommandTasks);
  });

  afterEach((): void => {
    sandbox.restore();
  });

  it('stops only the Kind clusters mapped to a Solo cluster reference', async (): Promise<void> => {
    await writeClusterReferences({solo: 'kind-solo-e2e'});

    await runTask(tasks.stopClusterState());

    expect(stopContainersStub.calledOnceWith('docker', [SOLO_CONTAINER.containerName])).to.be.true;
  });

  it('fails without stopping anything when no Kind cluster is mapped to a Solo cluster reference', async (): Promise<void> => {
    await writeClusterReferences({remote: 'some-remote-context'});

    await expect(runTask(tasks.stopClusterState())).to.be.rejectedWith(/None of the detected Kind clusters/);
    expect(stopContainersStub.called).to.be.false;
  });
});
