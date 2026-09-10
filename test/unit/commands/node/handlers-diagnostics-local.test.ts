// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import {NodeCommandHandlers} from '../../../../src/commands/node/handlers.js';
import {DeploymentCommandDefinition} from '../../../../src/commands/command-definitions/deployment-command-definition.js';
import {DiagnosticsCollector} from '../../../../src/commands/util/diagnostics-collector.js';
import {DiagnosticsReporter} from '../../../../src/commands/util/diagnostics-reporter.js';
import {GetSoloRemoteConfigMapTask} from '../../../../src/commands/util/get-solo-remote-config-map-task.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type LockManager} from '../../../../src/core/lock/lock-manager.js';
import {type ConfigManager} from '../../../../src/core/config-manager.js';
import {type LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {type NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {type NodeCommandConfigs} from '../../../../src/commands/node/configs.js';
import {type ArgvStruct} from '../../../../src/types/aliases.js';
import {type K8} from '../../../../src/integration/kube/k8.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type SoloListrTask} from '../../../../src/types/index.js';

/**
 * Creates a minimal stub for SoloLogger sufficient for NodeCommandHandlers construction.
 */
function makeLoggerStub(): SoloLogger {
  return {
    info: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub(),
    debug: sinon.stub(),
    showUser: sinon.stub(),
    showUserError: sinon.stub(),
    showList: sinon.stub(),
    showJSON: sinon.stub(),
  } as unknown as SoloLogger;
}

/**
 * Builds the positional command tokens for a `deployment diagnostics <subcommand>`
 * invocation from the command definition, avoiding hardcoded command strings.
 */
function diagnosticsCommand(subcommand: string): string[] {
  return [
    DeploymentCommandDefinition.COMMAND_NAME,
    DeploymentCommandDefinition.DIAGNOSTICS_SUBCOMMAND_NAME,
    subcommand,
  ];
}

/**
 * Builds a K8 stub whose context exists but whose API call fails with the given error,
 * mirroring a stale kubeconfig context pointing at a torn-down or restricted cluster.
 */
function makeK8WithListError(listError: Error): K8 {
  return {
    contexts: (): {readCurrent: () => string} => ({readCurrent: (): string => 'kind-solo'}),
    namespaces: (): {list: () => Promise<never>} => ({
      list: (): Promise<never> => Promise.reject(listError),
    }),
  } as unknown as K8;
}

/**
 * Builds a K8 stub for a reachable cluster: a current context is set and the API call
 * answers successfully.
 */
function makeReachableK8(): K8 {
  return {
    contexts: (): {readCurrent: () => string} => ({readCurrent: (): string => 'kind-solo'}),
    namespaces: (): {list: () => Promise<unknown[]>} => ({list: (): Promise<unknown[]> => Promise.resolve([])}),
  } as unknown as K8;
}

/**
 * A connection-refused error, as produced by the Kubernetes client when the API
 * server cannot be contacted (node network error code, no HTTP status).
 */
function connectionRefusedError(): Error {
  return Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:1'), {code: 'ECONNREFUSED'});
}

/**
 * An authorization error, as produced by the Kubernetes client when the server
 * responds with an HTTP status (here 403). The cluster is reachable.
 */
function forbiddenError(): Error {
  return Object.assign(new Error('Forbidden'), {code: 403});
}

describe('NodeCommandHandlers - diagnostics local fallback', (): void => {
  let handlers: NodeCommandHandlers;
  let loggerStub: SoloLogger;
  let collectLocalDiagnosticsStub: SinonStub;
  let analyzeStub: SinonStub;
  let initializeStub: SinonStub;
  let resolveDeploymentForLogsStub: SinonStub;
  let remoteConfigConfigMapExistsStub: SinonStub;
  let commandActionStub: SinonStub;
  let runDiagnosticsReportStub: SinonStub;
  let defaultK8Stub: SinonStub;
  let getHelmChartValuesStub: SinonStub;
  let downloadHieroComponentLogsStub: SinonStub;
  let getRemoteConfigMapTaskStub: SinonStub;

  beforeEach((): void => {
    loggerStub = makeLoggerStub();

    const leaseManagerStub: LockManager = sinon.stub() as unknown as LockManager;
    const configManagerStub: ConfigManager = sinon.createStubInstance(
      class FakeConfigManager {
        public update(): void {}
        public getFlag<T>(): T {
          return '' as unknown as T;
        }
      },
    ) as unknown as ConfigManager;

    const localConfigStub: LocalConfigRuntimeState = {
      load: sinon.stub().resolves(),
      configuration: {deployments: [{name: 'solo-deployment'}]},
    } as unknown as LocalConfigRuntimeState;
    const remoteConfigStub: RemoteConfigRuntimeStateApi = sinon.stub() as unknown as RemoteConfigRuntimeStateApi;

    const dummyTask: SoloListrTask<object> = {title: 'dummy', task: async (): Promise<void> => {}};
    analyzeStub = sinon.stub().returns(dummyTask);
    initializeStub = sinon.stub().returns(dummyTask);
    getHelmChartValuesStub = sinon.stub().returns(dummyTask);
    downloadHieroComponentLogsStub = sinon.stub().returns(dummyTask);
    const tasksStub: NodeCommandTasks = {
      analyzeCollectedDiagnostics: analyzeStub,
      initialize: initializeStub,
      getNodeLogsAndConfigs: sinon.stub().returns(dummyTask),
      getHelmChartValues: getHelmChartValuesStub,
      downloadHieroComponentLogs: downloadHieroComponentLogsStub,
      reportActivePortForwards: sinon.stub().returns(dummyTask),
    } as unknown as NodeCommandTasks;

    const configsStub: NodeCommandConfigs = {
      logsConfigBuilder: sinon.stub(),
    } as unknown as NodeCommandConfigs;

    // Default: no active Kubernetes context at all -> k8Factory.default() throws.
    // Individual tests may override defaultK8Stub to simulate a stale/unreachable cluster.
    defaultK8Stub = sinon.stub().throws(new Error('No active kubernetes context found.'));
    const k8FactoryStub: K8Factory = {
      default: defaultK8Stub,
    } as unknown as K8Factory;

    handlers = new NodeCommandHandlers(
      leaseManagerStub,
      configManagerStub,
      localConfigStub,
      remoteConfigStub,
      tasksStub,
      configsStub,
      k8FactoryStub,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).logger = loggerStub;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).nodeConfigManager = configManagerStub;

    resolveDeploymentForLogsStub = sinon
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .stub(NodeCommandHandlers.prototype as any, 'resolveDeploymentForLogs')
      .resolves('should-not-be-called');

    // Default: the deployment's remote config ConfigMap is present, so the reachable path
    // proceeds with full remote collection. Tests that exercise the absent case override this.
    remoteConfigConfigMapExistsStub = sinon
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .stub(NodeCommandHandlers.prototype as any, 'remoteConfigConfigMapExists')
      .resolves(true);

    const dummyCollectTask: SoloListrTask<object> = {title: 'collect', task: async (): Promise<void> => {}};
    collectLocalDiagnosticsStub = sinon.stub(DiagnosticsCollector, 'collectLocalDiagnostics').returns(dummyCollectTask);

    commandActionStub = sinon.stub(NodeCommandHandlers.prototype, 'commandAction').resolves();
    runDiagnosticsReportStub = sinon.stub(DiagnosticsReporter, 'runDiagnosticsReport').resolves();
    getRemoteConfigMapTaskStub = sinon.stub(GetSoloRemoteConfigMapTask, 'getTask').returns(dummyTask);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('logs collects local diagnostics when no active kube context is present', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_LOGS),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(commandActionStub).to.have.been.calledOnce;
    // Must not attempt cluster-dependent deployment resolution or the initialize task.
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('logs collects local diagnostics when the context is stale and the cluster is unreachable', async (): Promise<void> => {
    // Context exists (kubeconfig entry survives the cluster) but the API call is refused.
    defaultK8Stub.returns(makeK8WithListError(connectionRefusedError()));

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_LOGS),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('all collects local diagnostics when no active kube context is present', async (): Promise<void> => {
    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_ALL),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('all collects local diagnostics when the context is stale and the cluster is unreachable', async (): Promise<void> => {
    defaultK8Stub.returns(makeK8WithListError(connectionRefusedError()));

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_ALL),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    expect(initializeStub).to.not.have.been.called;
  });

  it('logs does NOT degrade when the cluster responds with an authorization error', async (): Promise<void> => {
    // The server answered (HTTP 403) -> the cluster is reachable; the real error must surface
    // through the normal collection path instead of being hidden by a local-only fallback.
    defaultK8Stub.returns(makeK8WithListError(forbiddenError()));

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_LOGS),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.not.have.been.called;
    expect(resolveDeploymentForLogsStub).to.have.been.calledOnce;
    // The reachable path confirms the remote config exists before loading it...
    expect(remoteConfigConfigMapExistsStub).to.have.been.calledOnce;
    // ...and proceeds with full remote collection when it does.
    expect(initializeStub).to.have.been.calledOnce;
  });

  it('logs scopes collectors to the selected deployment when --deployment is provided', async (): Promise<void> => {
    // Cluster is reachable and the ConfigMap exists → full remote collection path.
    // scopeToSelectedDeployment must be true when --deployment is given, so the
    // collectors target only that deployment's namespace instead of all namespaces.
    defaultK8Stub.returns(makeReachableK8());

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_LOGS),
      deployment: 'solo-deployment',
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.not.have.been.called;
    expect(getHelmChartValuesStub).to.have.been.calledOnce;
    expect(getHelmChartValuesStub.firstCall.args[1]).to.equal(true);
    expect(downloadHieroComponentLogsStub).to.have.been.calledOnce;
    expect(downloadHieroComponentLogsStub.firstCall.args[1]).to.equal(true);
    expect(getRemoteConfigMapTaskStub).to.have.been.calledOnce;
    expect(getRemoteConfigMapTaskStub.firstCall.args[3]).to.equal(true);
  });

  it('logs collects from all deployments when --deployment is omitted', async (): Promise<void> => {
    // Cluster is reachable and the ConfigMap exists → full remote collection path.
    // scopeToSelectedDeployment must be false when no --deployment flag is present,
    // so the collectors cover all Solo deployments cluster-wide.
    defaultK8Stub.returns(makeReachableK8());

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_LOGS),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.not.have.been.called;
    expect(getHelmChartValuesStub).to.have.been.calledOnce;
    expect(getHelmChartValuesStub.firstCall.args[1]).to.equal(false);
    expect(downloadHieroComponentLogsStub).to.have.been.calledOnce;
    expect(downloadHieroComponentLogsStub.firstCall.args[1]).to.equal(false);
    expect(getRemoteConfigMapTaskStub).to.have.been.calledOnce;
    expect(getRemoteConfigMapTaskStub.firstCall.args[3]).to.equal(false);
  });

  it('all scopes collectors to the selected deployment when --deployment is provided', async (): Promise<void> => {
    // Cluster is reachable and the ConfigMap exists → full remote collection path.
    // scopeToSelectedDeployment must be true when --deployment is given.
    defaultK8Stub.returns(makeReachableK8());

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_ALL),
      deployment: 'solo-deployment',
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.not.have.been.called;
    expect(getHelmChartValuesStub).to.have.been.calledOnce;
    expect(getHelmChartValuesStub.firstCall.args[1]).to.equal(true);
    expect(downloadHieroComponentLogsStub).to.have.been.calledOnce;
    expect(downloadHieroComponentLogsStub.firstCall.args[1]).to.equal(true);
    expect(getRemoteConfigMapTaskStub).to.have.been.calledOnce;
    expect(getRemoteConfigMapTaskStub.firstCall.args[3]).to.equal(true);
  });

  it('all collects from all deployments when --deployment is omitted', async (): Promise<void> => {
    // Cluster is reachable and the ConfigMap exists → full remote collection path.
    // scopeToSelectedDeployment must be false when no --deployment flag is present.
    defaultK8Stub.returns(makeReachableK8());

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_ALL),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.not.have.been.called;
    expect(getHelmChartValuesStub).to.have.been.calledOnce;
    expect(getHelmChartValuesStub.firstCall.args[1]).to.equal(false);
    expect(downloadHieroComponentLogsStub).to.have.been.calledOnce;
    expect(downloadHieroComponentLogsStub.firstCall.args[1]).to.equal(false);
    expect(getRemoteConfigMapTaskStub).to.have.been.calledOnce;
    expect(getRemoteConfigMapTaskStub.firstCall.args[3]).to.equal(false);
  });

  it('logs collects local diagnostics when the deployment has no remote config ConfigMap', async (): Promise<void> => {
    // The cluster is reachable, but the deployment's solo-remote-config ConfigMap is gone
    // (for example after a `network destroy`, which deletes it). Loading the remote config
    // would throw, so diagnostics must degrade to local-only collection instead of failing.
    defaultK8Stub.returns(makeReachableK8());
    remoteConfigConfigMapExistsStub.resolves(false);

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_LOGS),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.logs(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    // The deployment is resolved and probed, but the remote-config-dependent initialize is skipped.
    expect(resolveDeploymentForLogsStub).to.have.been.calledOnce;
    expect(remoteConfigConfigMapExistsStub).to.have.been.calledOnce;
    expect(initializeStub).to.not.have.been.called;
  });

  it('all collects local diagnostics when the deployment has no remote config ConfigMap', async (): Promise<void> => {
    defaultK8Stub.returns(makeReachableK8());
    remoteConfigConfigMapExistsStub.resolves(false);

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_ALL),
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.all(argv);

    expect(result).to.equal(true);
    expect(collectLocalDiagnosticsStub).to.have.been.calledOnce;
    expect(analyzeStub).to.have.been.calledOnce;
    expect(remoteConfigConfigMapExistsStub).to.have.been.calledOnce;
    expect(initializeStub).to.not.have.been.called;
  });

  it('report resolves the deployment from local config when the cluster is unreachable', async (): Promise<void> => {
    defaultK8Stub.returns(makeK8WithListError(connectionRefusedError()));

    const argv: ArgvStruct = {
      _: diagnosticsCommand(DeploymentCommandDefinition.DIAGNOSTICS_REPORT),
      quiet: true,
    } as unknown as ArgvStruct;

    const result: boolean = await handlers.report(argv);

    expect(result).to.equal(true);
    // The unreachable branch must resolve the deployment locally (not via the cluster path)...
    expect(resolveDeploymentForLogsStub).to.not.have.been.called;
    // ...and still drive the report with that locally-resolved deployment name.
    expect(runDiagnosticsReportStub).to.have.been.calledOnce;
    expect(runDiagnosticsReportStub.firstCall.args[0].deployment).to.equal('solo-deployment');
  });
});

describe('NodeCommandHandlers - remoteConfigConfigMapExists', (): void => {
  let existsStub: SinonStub;
  let getK8Stub: SinonStub;

  /**
   * Builds a NodeCommandHandlers whose local config resolves a deployment to namespace
   * 'one-shot' / context 'kind-solo', and whose K8 client reports ConfigMap presence via
   * existsStub. When deploymentPresent is false, the deployment is absent from local config.
   */
  function buildHandlers(deploymentPresent: boolean): NodeCommandHandlers {
    const deployment: object = {
      namespace: 'one-shot',
      clusters: {get: (): {toString: () => string} => ({toString: (): string => 'cluster-ref-1'})},
    };
    const localConfigStub: LocalConfigRuntimeState = {
      load: sinon.stub().resolves(),
      configuration: {
        deploymentByName: (name: string): object => {
          if (!deploymentPresent) {
            throw new Error(`Deployment ${name} not found in local config`);
          }
          return deployment;
        },
        clusterRefs: {get: (): {toString: () => string} => ({toString: (): string => 'kind-solo'})},
      },
    } as unknown as LocalConfigRuntimeState;

    existsStub = sinon.stub().resolves(true);
    getK8Stub = sinon.stub().returns({configMaps: (): {exists: SinonStub} => ({exists: existsStub})});
    const k8FactoryStub: K8Factory = {getK8: getK8Stub} as unknown as K8Factory;

    const configManagerStub: ConfigManager = sinon.createStubInstance(
      class FakeConfigManager {
        public update(): void {}
        public getFlag<T>(): T {
          return '' as unknown as T;
        }
      },
    ) as unknown as ConfigManager;

    const handlers: NodeCommandHandlers = new NodeCommandHandlers(
      sinon.stub() as unknown as LockManager,
      configManagerStub,
      localConfigStub,
      sinon.stub() as unknown as RemoteConfigRuntimeStateApi,
      {} as unknown as NodeCommandTasks,
      {} as unknown as NodeCommandConfigs,
      k8FactoryStub,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (handlers as any).logger = makeLoggerStub();
    return handlers;
  }

  afterEach((): void => {
    sinon.restore();
  });

  it('returns false when the solo-remote-config ConfigMap is absent', async (): Promise<void> => {
    const handlers: NodeCommandHandlers = buildHandlers(true);
    existsStub.resolves(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: boolean = await (handlers as any).remoteConfigConfigMapExists('one-shot');

    expect(result).to.equal(false);
    // The context is resolved from local config and used to probe the correct cluster.
    expect(getK8Stub).to.have.been.calledWith('kind-solo');
  });

  it('returns true when the solo-remote-config ConfigMap is present', async (): Promise<void> => {
    const handlers: NodeCommandHandlers = buildHandlers(true);
    existsStub.resolves(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: boolean = await (handlers as any).remoteConfigConfigMapExists('one-shot');

    expect(result).to.equal(true);
  });

  it('returns true (proceeds) when the deployment is not held in local config', async (): Promise<void> => {
    const handlers: NodeCommandHandlers = buildHandlers(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: boolean = await (handlers as any).remoteConfigConfigMapExists('unknown');

    expect(result).to.equal(true);
    // A deployment discovered from a live remote scan needs no probe; the cluster is not touched.
    expect(getK8Stub).to.not.have.been.called;
  });

  it('returns true (proceeds) when the existence probe fails for a non-404 reason', async (): Promise<void> => {
    const handlers: NodeCommandHandlers = buildHandlers(true);
    existsStub.rejects(new Error('transient API error'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: boolean = await (handlers as any).remoteConfigConfigMapExists('one-shot');

    expect(result).to.equal(true);
  });
});
