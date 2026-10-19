// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {ConsensusNodePathTemplates} from '../../../../src/core/consensus-node-path-templates.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import * as constants from '../../../../src/core/constants.js';
import {NodeCommandHandlers} from '../../../../src/commands/node/handlers.js';
import {type NodeStartConfigClass} from '../../../../src/commands/node/config-interfaces/node-start-config-class.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../src/types/index.js';
import {type AnyListrContext} from '../../../../src/types/aliases.js';

type FakeContainer = {execContainer: sinon.SinonStub; copyTo: sinon.SinonStub};

const generatedRoster: string = '/staging/override-network.json';

function createTasks(container: FakeContainer): NodeCommandTasks {
  const tasks: NodeCommandTasks = Object.create(NodeCommandTasks.prototype) as NodeCommandTasks;

  (tasks as unknown as {k8Factory: unknown}).k8Factory = {
    getK8: (): {containers: () => {readByRef: () => FakeContainer}} => ({
      containers: (): {readByRef: () => FakeContainer} => ({
        readByRef: (): FakeContainer => container,
      }),
    }),
  };

  // Generation reads the live remote config and service map; stubbed so this stays a unit test.
  (tasks as unknown as {generateNetworkJson: unknown}).generateNetworkJson = sinon.stub().resolves(generatedRoster);

  return tasks;
}

async function runTask(tasks: NodeCommandTasks, configOverrides: Record<string, unknown> = {}): Promise<void> {
  const task: SoloListrTask<AnyListrContext> = tasks.installOverrideNetworkJson(
    false,
  ) as unknown as SoloListrTask<AnyListrContext>;

  await task.task(
    {
      config: {
        namespace: NamespaceName.of('solo-e2e'),
        nodeAliases: ['node1'],
        consensusNodes: [{name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'}],
        // Deliberately no stagingDir/cacheDir: START_FLAGS omits the flags that populate them, so the real
        // start config has neither. Supplying them here once hid a crash on `undefined`.
        podRefs: {node1: PodReference.of(NamespaceName.of('solo-e2e'), PodName.of('network-node1-0'))},
        ...configOverrides,
      },
    } as unknown as AnyListrContext,
    {} as unknown as SoloListrTaskWrapper<AnyListrContext>,
  );
}

function generateStub(tasks: NodeCommandTasks): sinon.SinonStub {
  return (tasks as unknown as {generateNetworkJson: sinon.SinonStub}).generateNetworkJson;
}

describe('installOverrideNetworkJson', (): void => {
  let container: FakeContainer;
  let tasks: NodeCommandTasks;

  afterEach((): void => {
    sinon.restore();
  });

  beforeEach((): void => {
    container = {execContainer: sinon.stub().resolves(), copyTo: sinon.stub().resolves()};
    tasks = createTasks(container);
  });

  it('derives the roster from live state rather than a genesis-time snapshot', async (): Promise<void> => {
    await runTask(tasks);

    const generate: sinon.SinonStub = generateStub(tasks);
    expect(generate.calledOnce, 'the roster should be generated, not copied').to.be.true;
    expect(generate.firstCall.args[0]).to.equal(constants.OVERRIDE_NETWORK_FILE);
    // Generating from the namespace and the current consensus nodes is what keeps it current after a
    // node add or update.
    expect(generate.firstCall.args[2]).to.deep.equal([
      {name: 'node1', nodeId: 0, cluster: 'cluster-1', context: 'context-1'},
    ]);
    // A defined output directory, not config.stagingDir, which `node start` never populates.
    const outputDirectory: string = generate.firstCall.args[3] as string;
    expect(outputDirectory).to.match(/[/\\]override-network-[^/\\]+$/);
    expect(PathEx.dirname(outputDirectory)).to.equal(constants.SOLO_CACHE_DIR);
  });

  it('writes to a directory of its own, so concurrent transplants cannot cross rosters', async (): Promise<void> => {
    await runTask(tasks);
    const first: string = generateStub(tasks).firstCall.args[3] as string;

    container = {execContainer: sinon.stub().resolves(), copyTo: sinon.stub().resolves()};
    tasks = createTasks(container);
    await runTask(tasks);
    const second: string = generateStub(tasks).firstCall.args[3] as string;

    expect(second).to.not.equal(first);
    // The directory only has to outlive the copy into each pod.
    expect(fs.existsSync(first), 'the temporary directory should be removed once the copies are done').to.be.false;
    expect(fs.existsSync(second), 'the temporary directory should be removed once the copies are done').to.be.false;
  });

  it('places it where the consensus node looks for it', async (): Promise<void> => {
    await runTask(tasks);

    expect(container.copyTo.calledOnceWithExactly(generatedRoster, ConsensusNodePathTemplates.DATA_CONFIG)).to.be.true;
  });

  it('hands it to the hedera user, since copyTo lands it as root', async (): Promise<void> => {
    await runTask(tasks);

    const commands: string[] = container.execContainer
      .getCalls()
      .map((call): string => (call.args[0] as string[]).join(' '));

    expect(
      commands.some(
        (command): boolean =>
          command.includes('chown hedera:hedera') && command.includes(ConsensusNodePathTemplates.OVERRIDE_NETWORK_JSON),
      ),
      'a root-owned override is silently rejected by the node with AccessDeniedException',
    ).to.be.true;
  });

  it('carries the skip decision through, so a plain start writes nothing', (): void => {
    const skip: () => boolean = (): boolean => true;
    expect(tasks.installOverrideNetworkJson(skip).skip).to.equal(skip);
  });

  // The roster must describe the endpoints the target network was actually set up with. Without these the
  // generated override falls back to HEDERA_NODE_EXTERNAL_GOSSIP_PORT and GRPC_PORT, replacing a correct
  // roster with a default-port one — the failure this feature exists to prevent, from the other direction.
  it('passes the endpoint overrides through, so the roster is not written on the defaults', async (): Promise<void> => {
    const domainNamesMapping: Record<string, string> = {node1: 'node1.example.com'};
    const gossipEndpointPortMapping: Record<string, number> = {node1: 12_345};
    const serviceEndpointPortMapping: Record<string, number> = {node1: 23_456};

    await runTask(tasks, {domainNamesMapping, gossipEndpointPortMapping, serviceEndpointPortMapping});

    const generate: sinon.SinonStub = generateStub(tasks);
    expect(generate.firstCall.args[4]).to.deep.equal(domainNamesMapping);
    expect(generate.firstCall.args[5]).to.deep.equal(gossipEndpointPortMapping);
    expect(generate.firstCall.args[6]).to.deep.equal(serviceEndpointPortMapping);
  });

  // The predicate `consensus node start` supplies. Getting this wrong installed an override on every state
  // restore, which broke the state-save-and-restore example: replacing the roster in a network's own state
  // forces a roster transition the consensus node cannot replay past. Imported rather than re-declared, so
  // a change to the real predicate fails here instead of passing against a copy.
  describe('the skip predicate used by consensus node start', (): void => {
    const skipPredicate: (context: {config: NodeStartConfigClass}) => boolean =
      NodeCommandHandlers.skipOverrideNetworkJson;

    function configOf(transplant?: boolean): {config: NodeStartConfigClass} {
      return {config: {transplant} as NodeStartConfigClass};
    }

    it('runs only when a transplant is asked for', (): void => {
      expect(skipPredicate(configOf(true))).to.be.false;
    });

    it('skips a restore of the network own state, which must keep the roster in that state', (): void => {
      expect(skipPredicate(configOf(false))).to.be.true;
      expect(skipPredicate(configOf())).to.be.true;
    });
  });
});
