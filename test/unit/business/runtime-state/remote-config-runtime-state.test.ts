// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import sinon, {type SinonSandbox, type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {RemoteConfigRuntimeState} from '../../../../src/business/runtime-state/config/remote/remote-config-runtime-state.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {Flags as flags} from '../../../../src/commands/flags.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {RemoteConfigMissingOnKindClusterError} from '../../../../src/core/errors/classes/config/remote-config-missing-on-kind-cluster-error.js';
import {SoloErrors} from '../../../../src/core/errors/solo-errors.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type ObjectMapper} from '../../../../src/data/mapper/api/object-mapper.js';
import {ResourceOperation} from '../../../../src/integration/kube/resources/resource-operation.js';
import {ResourceType} from '../../../../src/integration/kube/resources/resource-type.js';
import {ResourceNotFoundError} from '../../../../src/integration/kube/errors/resource-operation-errors.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type RemoteConfigValidatorApi} from '../../../../src/core/config/remote/api/remote-config-validator-api.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {type ArgvStruct} from '../../../../src/types/aliases.js';
import {ClusterUnreachableError} from '../../../../src/core/errors/classes/system/cluster-unreachable-error.js';
import {KubernetesApiInvalidResponseSoloError} from '../../../../src/core/errors/classes/system/kubernetes-api-invalid-response-solo-error.js';
import {KindClusterStoppedError} from '../../../../src/core/errors/classes/system/kind-cluster-stopped-error.js';
import {ContainerEngineNotRunningError} from '../../../../src/core/errors/classes/system/container-engine-not-running-error.js';
import {type ConfigMap} from '../../../../src/integration/kube/resources/config-map/config-map.js';
import {type ContainerEngineClient} from '../../../../src/integration/container-engine/container-engine-client.js';
import {ClusterNodeResumeOutcome} from '../../../../src/integration/container-engine/cluster-node-resume-outcome.js';
import {Helpers} from '../../../../src/core/helpers.js';
import {type Context} from '../../../../src/types/index.js';

const namespace: NamespaceName = NamespaceName.of('solo');
const remoteConfigMap: ConfigMap = {name: 'solo-remote-config'} as unknown as ConfigMap;

/** Kubeconfig cluster entry lookup for the stubbed K8Factory; a context defaults to an equally-named entry. */
function stubReadClusterOfContext(clusterEntriesByContext: Record<string, string>): (context: string) => string {
  return (context: string): string => clusterEntriesByContext[context] ?? context;
}

/**
 * Builds a runtime state over a stubbed ConfigMap read and a stubbed container engine. Only those two
 * dependencies are exercised; the rest are non-null so they are not resolved from the container.
 */
function buildRuntimeState(
  read: SinonStub,
  resumeStoppedClusterNode: SinonStub,
  clusterEntriesByContext: Record<string, string> = {},
): RemoteConfigRuntimeState {
  const k8Factory: K8Factory = {
    getK8: (): unknown => ({configMaps: (): unknown => ({read})}),
    default: (): unknown => ({
      contexts: (): unknown => ({readClusterOfContext: stubReadClusterOfContext(clusterEntriesByContext)}),
    }),
  } as unknown as K8Factory;

  return new RemoteConfigRuntimeState(
    k8Factory,
    {showUser: (): void => undefined} as unknown as SoloLogger,
    {} as unknown as never,
    {} as unknown as never,
    {} as unknown as never,
    {} as unknown as never,
    {resumeStoppedClusterNode} as unknown as ContainerEngineClient,
  );
}

/** Resolves with the error thrown while reading the remote config ConfigMap over the given context. */
async function readFailure(runtimeState: RemoteConfigRuntimeState, context: Context): Promise<Error> {
  return await runtimeState.remoteConfigExists(namespace, context).then(
    (): Error => undefined,
    (error: Error): Error => error,
  );
}

describe('RemoteConfigRuntimeState', (): void => {
  const namespace: NamespaceName = NamespaceName.of('solo');
  const deploymentName: string = 'solo-deployment';
  let sandbox: SinonSandbox;
  let read: SinonStub;
  let resumeStoppedClusterNode: SinonStub;

  let configManager: ConfigManager;
  let readStub: sinon.SinonStub;

  function newRuntimeState(context: string): RemoteConfigRuntimeState {
    const flagValues: Map<string, unknown> = new Map<string, unknown>([
      [flags.namespace.name, namespace.name],
      [flags.deployment.name, deploymentName],
      [flags.context.name, context],
    ]);

    configManager = {
      getFlag: (flag: {name: string}): unknown => flagValues.get(flag.name),
      setFlag: (flag: {name: string}, value: unknown): void => {
        flagValues.set(flag.name, value);
      },
      hasFlag: (flag: {name: string}): boolean => flagValues.has(flag.name),
    } as unknown as ConfigManager;

    // No deployment in local config sends populateClusterReferences down its fallback path, which
    // resolves the namespace and context from the flags above.
    const localConfig: LocalConfigRuntimeState = {
      configuration: {
        deploymentByName: (): never => {
          throw new SoloErrors.deployment.notFound(deploymentName);
        },
      },
    } as unknown as LocalConfigRuntimeState;

    const k8Factory: K8Factory = {
      getK8: (): {configMaps: () => {read: sinon.SinonStub}} => ({
        configMaps: (): {read: sinon.SinonStub} => ({read: readStub}),
      }),
      default: (): unknown => ({
        contexts: (): unknown => ({readClusterOfContext: stubReadClusterOfContext({})}),
      }),
    } as unknown as K8Factory;

    const logger: SoloLogger = {
      info: (): void => {},
      warn: (): void => {},
      debug: (): void => {},
    } as unknown as SoloLogger;

    return new RemoteConfigRuntimeState(
      k8Factory,
      logger,
      localConfig,
      configManager,
      {} as unknown as RemoteConfigValidatorApi,
      {} as unknown as ObjectMapper,
      {resumeStoppedClusterNode} as unknown as ContainerEngineClient,
    );
  }

  beforeEach((): void => {
    readStub = sinon.stub();
    sandbox = sinon.createSandbox();
    read = sandbox.stub();
    resumeStoppedClusterNode = sandbox.stub().resolves(ClusterNodeResumeOutcome.UNCHANGED);
  });

  afterEach((): void => {
    sandbox.restore();
  });

  const argv: ArgvStruct = {_: ['mirror', 'node', 'add']} as unknown as ArgvStruct;

  it('reports a missing remote config on a kind cluster as recoverable', async (): Promise<void> => {
    readStub.rejects(
      new ResourceNotFoundError(ResourceOperation.READ, ResourceType.CONFIG_MAP, namespace, 'solo-remote-config'),
    );

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('kind-solo');

    try {
      await runtimeState.loadAndValidate(argv);
      expect.fail('loadAndValidate should have thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(RemoteConfigMissingOnKindClusterError);
      const recoverable: RemoteConfigMissingOnKindClusterError = error as RemoteConfigMissingOnKindClusterError;
      expect(recoverable.deploymentName).to.equal(deploymentName);
      expect(recoverable.namespace).to.equal(namespace.name);
      expect(recoverable.context).to.equal('kind-solo');
      expect(recoverable.getFormattedCode()).to.equal('SOLO-1008');
    }
  });

  it('reports a nullish remote config read on a kind cluster as recoverable', async (): Promise<void> => {
    readStub.resolves();

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('kind-solo');

    await expect(runtimeState.loadAndValidate(argv)).to.be.rejectedWith(RemoteConfigMissingOnKindClusterError);
  });

  it('fails fast on a missing remote config outside a kind cluster', async (): Promise<void> => {
    const notFound: ResourceNotFoundError = new ResourceNotFoundError(
      ResourceOperation.READ,
      ResourceType.CONFIG_MAP,
      namespace,
      'solo-remote-config',
    );
    readStub.rejects(notFound);

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('gke_my-project_us-central1_my-cluster');

    try {
      await runtimeState.loadAndValidate(argv);
      expect.fail('loadAndValidate should have thrown');
    } catch (error) {
      expect(error).to.not.be.instanceOf(RemoteConfigMissingOnKindClusterError);
      expect(error).to.be.instanceOf(ResourceNotFoundError);
    }
  });

  it('leaves an unrelated load failure untouched on a kind cluster', async (): Promise<void> => {
    readStub.rejects(new Error('connection refused'));

    const runtimeState: RemoteConfigRuntimeState = newRuntimeState('kind-solo');

    try {
      await runtimeState.loadAndValidate(argv);
      expect.fail('loadAndValidate should have thrown');
    } catch (error) {
      expect(error).to.not.be.instanceOf(RemoteConfigMissingOnKindClusterError);
    }
  });

  it('should throw ClusterUnreachableError preserving the cause for a non-kind context', async (): Promise<void> => {
    const cause: Error = new Error('connect ECONNREFUSED 10.0.0.1:6443');
    read.rejects(cause);

    const error: Error = await readFailure(buildRuntimeState(read, resumeStoppedClusterNode), 'production-cluster');

    expect(error).to.be.instanceOf(ClusterUnreachableError);
    expect(error.message).to.contain('production-cluster');
    expect(error.message).to.contain('connect ECONNREFUSED 10.0.0.1:6443');
    expect(error.cause).to.equal(cause);
    // A remote cluster has no local node container, so the engine must not be touched at all.
    expect(resumeStoppedClusterNode).to.not.have.been.called;
  });

  it('should rethrow ResourceNotFoundError untouched', async (): Promise<void> => {
    const notFound: ResourceNotFoundError = new ResourceNotFoundError(
      ResourceOperation.READ,
      ResourceType.CONFIG_MAP,
      namespace,
      'solo-remote-config',
    );
    read.rejects(notFound);

    const error: Error = await readFailure(buildRuntimeState(read, resumeStoppedClusterNode), 'production-cluster');

    expect(error).to.equal(notFound);
  });

  it('should keep KubernetesApiInvalidResponseSoloError when a kind node container was not resumed', async (): Promise<void> => {
    const cause: Error = new Error('configmaps is forbidden: User cannot list resource');
    read.rejects(cause);

    const error: Error = await readFailure(buildRuntimeState(read, resumeStoppedClusterNode), 'kind-solo');

    expect(error).to.be.instanceOf(KubernetesApiInvalidResponseSoloError);
    expect(error.message).to.contain('configmaps is forbidden: User cannot list resource');
    expect(error.cause).to.equal(cause);
    expect(resumeStoppedClusterNode).to.have.been.calledOnceWithExactly('solo');
  });

  it('should throw ContainerEngineNotRunningError when no container engine answers', async (): Promise<void> => {
    const cause: Error = new Error('connect ECONNREFUSED 127.0.0.1:52810');
    read.rejects(cause);
    resumeStoppedClusterNode.resolves(ClusterNodeResumeOutcome.ENGINE_UNAVAILABLE);

    const error: Error = await readFailure(buildRuntimeState(read, resumeStoppedClusterNode), 'kind-solo');

    expect(error).to.be.instanceOf(ContainerEngineNotRunningError);
    expect(error.cause).to.equal(cause);
  });

  it('should read again once a stopped kind cluster has been resumed', async (): Promise<void> => {
    read.onFirstCall().rejects(new Error('connect ECONNREFUSED 127.0.0.1:52810'));
    read.onSecondCall().resolves(remoteConfigMap);
    resumeStoppedClusterNode.resolves(ClusterNodeResumeOutcome.RESUMED);

    const exists: boolean = await buildRuntimeState(read, resumeStoppedClusterNode).remoteConfigExists(
      namespace,
      'kind-solo',
    );

    expect(exists).to.be.true;
    expect(resumeStoppedClusterNode).to.have.been.calledOnceWithExactly('solo');
    expect(read).to.have.been.calledTwice;
  });

  it('should resume a stopped kind cluster reached through a renamed context', async (): Promise<void> => {
    read.onFirstCall().rejects(new Error('connect ECONNREFUSED 127.0.0.1:52810'));
    read.onSecondCall().resolves(remoteConfigMap);
    resumeStoppedClusterNode.resolves(ClusterNodeResumeOutcome.RESUMED);

    const exists: boolean = await buildRuntimeState(read, resumeStoppedClusterNode, {
      'solo-renamed': 'kind-solo',
    }).remoteConfigExists(namespace, 'solo-renamed');

    expect(exists).to.be.true;
    expect(resumeStoppedClusterNode).to.have.been.calledOnceWithExactly('solo');
    expect(read).to.have.been.calledTwice;
  });

  it('should throw KindClusterStoppedError when a resumed kind cluster never answers', async (): Promise<void> => {
    const cause: Error = new Error('connect ECONNREFUSED 127.0.0.1:52810');
    read.rejects(cause);
    resumeStoppedClusterNode.resolves(ClusterNodeResumeOutcome.RESUMED);
    // The wait between attempts is real time the assertion does not need; only the retry count matters.
    const sleep: SinonStub = sandbox.stub(Helpers, 'sleep').resolves();

    const error: Error = await readFailure(buildRuntimeState(read, resumeStoppedClusterNode), 'kind-solo');

    expect(error).to.be.instanceOf(KindClusterStoppedError);
    expect(error.message).to.contain("kind cluster 'solo'");
    expect(error.cause).to.equal(cause);
    // The initial read, then one read per resume attempt, sleeping between the attempts but not before the first.
    expect(read.callCount).to.equal(31);
    expect(sleep.callCount).to.equal(29);
  });
});
