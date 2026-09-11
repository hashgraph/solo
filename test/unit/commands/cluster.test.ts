// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonSandbox, type SinonStub, type SinonStubbedInstance} from 'sinon';
import {before, beforeEach, describe} from 'mocha';
import {expect} from 'chai';
import {getTestCluster, HEDERA_PLATFORM_VERSION_TAG} from '../../test-utility.js';
import {Flags as flags} from '../../../src/commands/flags.js';
import * as version from '../../../version.js';
import * as constants from '../../../src/core/constants.js';
import {ConfigManager} from '../../../src/core/config-manager.js';
import {ChartManager} from '../../../src/core/chart-manager.js';
import {container} from 'tsyringe-neo';
import {resetForTest} from '../../test-container.js';
import {K8Client} from '../../../src/integration/kube/k8-client/k8-client.js';
import {K8ClientFactory} from '../../../src/integration/kube/k8-client/k8-client-factory.js';
import {DependencyManager} from '../../../src/core/dependency-managers/index.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {InjectTokens} from '../../../src/core/dependency-injection/inject-tokens.js';
import {Argv} from '../../helpers/argv-wrapper.js';
import {DefaultHelmClient} from '../../../src/integration/helm/impl/default-helm-client.js';
import {ClusterCommandHandlers} from '../../../src/commands/cluster/handlers.js';
import {SoloPinoLogger} from '../../../src/core/logging/solo-pino-logger.js';
import {type SoloLogger} from '../../../src/core/logging/solo-logger.js';
import {LocalConfigRuntimeState} from '../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {ClusterCommandTasks} from '../../../src/commands/cluster/tasks.js';
import {type ClusterReferenceResetContext} from '../../../src/commands/cluster/config-interfaces/cluster-reference-reset-context.js';
import {type SoloListrTaskWrapper, type SoloListrTask} from '../../../src/types/index.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type HelmChartValues} from '../../../src/integration/helm/model/values.js';
import {type ReleaseItem} from '../../../src/integration/helm/model/release/release-item.js';
import {type ClusterChecks} from '../../../src/core/cluster-checks.js';
import {SoloError} from '../../../src/core/errors/solo-error.js';
import {MINIO_OPERATOR_VERSION} from '../../../version.js';

type BaseCommandOptions = {
  logger: SinonStubbedInstance<SoloLogger>;
  helm: SinonStubbedInstance<DefaultHelmClient>;
  k8Factory: SinonStubbedInstance<K8ClientFactory>;
  chartManager: SinonStubbedInstance<ChartManager>;
  configManager: SinonStubbedInstance<ConfigManager>;
  depManager: SinonStubbedInstance<DependencyManager>;
  localConfig: SinonStubbedInstance<LocalConfigRuntimeState>;
};

const getBaseCommandOptions: (context: string) => BaseCommandOptions = (context: string): BaseCommandOptions => {
  const options: BaseCommandOptions = {
    logger: sandbox.createStubInstance<SoloLogger>(SoloPinoLogger),
    helm: sandbox.createStubInstance(DefaultHelmClient),
    k8Factory: sandbox.createStubInstance(K8ClientFactory),
    chartManager: sandbox.createStubInstance(ChartManager),
    configManager: sandbox.createStubInstance(ConfigManager),
    depManager: sandbox.createStubInstance(DependencyManager),
    localConfig: sandbox.createStubInstance(LocalConfigRuntimeState),
  };
  const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
  options.k8Factory.default.returns(new K8Client(context, k8Factory.default().getKubectlExecutablePath()));
  return options;
};

const testName: string = 'cluster-cmd-unit';
const namespace: NamespaceName = NamespaceName.of(testName);
const argv: Argv = Argv.getDefaultArgv(namespace);
const sandbox: SinonSandbox = sinon.createSandbox();

argv.setArg(flags.namespace, namespace.name);
argv.setArg(flags.deployment, `${namespace.name}-deployment`);
argv.setArg(flags.consensusNodeVersion, HEDERA_PLATFORM_VERSION_TAG);
argv.setArg(flags.nodeAliasesUnparsed, 'node1');
argv.setArg(flags.generateGossipKeys, true);
argv.setArg(flags.generateTlsKeys, true);
argv.setArg(flags.clusterRef, getTestCluster());
argv.setArg(flags.soloChartVersion, version.SOLO_CHART_VERSION);
argv.setArg(flags.force, true);
argv.setArg(flags.clusterSetupNamespace, constants.SOLO_SETUP_NAMESPACE.name);

describe('ClusterCommand unit tests', (): void => {
  before(async (): Promise<void> => {
    resetForTest(namespace.name);
    const localConfig: LocalConfigRuntimeState = container.resolve(InjectTokens.LocalConfigRuntimeState);
    await localConfig.load();
  });

  describe('Chart Install Function is called correctly', (): void => {
    let options: any;

    afterEach((): void => {
      sandbox.restore();
    });

    beforeEach((): void => {
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      const context: string = k8Factory.default().contexts().readCurrent();
      options = getBaseCommandOptions(context);
      options.logger = container.resolve(InjectTokens.SoloLogger);
      options.helm = container.resolve(InjectTokens.Helm);
      options.chartManager = container.resolve(InjectTokens.ChartManager);
      options.helm.dependency = sandbox.stub();

      // Stubbed through the sandbox, not assigned over: a plain assignment survives sandbox.restore()
      // and leaks these stubs into every later suite that resolves the same container singleton.
      sandbox.stub(options.chartManager, 'isChartInstalled').returns(false);
      sandbox.stub(options.chartManager, 'getInstalledRelease').resolves();
      sandbox.stub(options.chartManager, 'install').returns(true);

      // Simple mock for installPodMonitorRole to avoid cluster connection
      sandbox.stub(ClusterCommandTasks.prototype, 'installPodMonitorRole' as any).returns({
        title: 'Install pod-monitor-role ClusterRole',
        task: async (): Promise<void> => {},
      });

      // The MinIO CRD probe reaches the cluster; report every CRD absent so setup takes the install path.
      // Only `crds()` is replaced — the rest of the client stays real, since this path also uses
      // `contexts()` and others.
      const k8: ReturnType<K8Factory['getK8']> = k8Factory.getK8(context);
      sandbox
        .stub(k8, 'crds')
        .returns({readLabels: sandbox.stub().resolves()} as unknown as ReturnType<typeof k8.crds>);
      sandbox.stub(k8Factory, 'getK8').returns(k8);
      sandbox.stub(k8Factory, 'default').returns(k8);

      options.configManager = container.resolve(InjectTokens.ConfigManager);
      options.remoteConfig = sandbox.stub();
    });

    it('Install function is called with expected parameters', async (): Promise<void> => {
      const clusterCommandHandlers: ClusterCommandHandlers = container.resolve(ClusterCommandHandlers);
      await clusterCommandHandlers.setup(argv.build());

      expect(options.chartManager.install.args[0][0].name).to.equal(constants.SOLO_SETUP_NAMESPACE.name);
      expect(options.chartManager.install.args[0][1]).to.equal(constants.MINIO_OPERATOR_RELEASE_NAME);
      expect(options.chartManager.install.args[0][2]).to.equal(constants.MINIO_OPERATOR_CHART);
      expect(options.chartManager.install.args[0][3]).to.equal(constants.MINIO_OPERATOR_CHART);
    });

    it('Should use local chart directory', async (): Promise<void> => {
      argv.setArg(flags.chartDirectory, 'test-directory');
      argv.setArg(flags.force, true);

      const clusterCommandHandlers: ClusterCommandHandlers = container.resolve(ClusterCommandHandlers);
      await clusterCommandHandlers.setup(argv.build());

      expect(options.chartManager.install.args[0][2]).to.equal(constants.MINIO_OPERATOR_CHART);
    });

    it('Prometheus stack install passes the solo prometheus values file', async (): Promise<void> => {
      argv.setArg(flags.deployPrometheusStack, true);

      const clusterCommandHandlers: ClusterCommandHandlers = container.resolve(ClusterCommandHandlers);
      await clusterCommandHandlers.setup(argv.build());

      const prometheusInstall: unknown[] | undefined = options.chartManager.install.args.find(
        (callArguments: unknown[]): boolean => callArguments[1] === constants.PROMETHEUS_RELEASE_NAME,
      );
      expect(prometheusInstall, 'expected a chart install call for the prometheus stack').to.not.equal(undefined);
      expect(prometheusInstall[4]).to.equal(version.PROMETHEUS_STACK_VERSION);
      expect((prometheusInstall[5] as HelmChartValues).toArguments()).to.deep.equal([
        '--values',
        constants.PROMETHEUS_STACK_VALUES_FILE,
      ]);

      argv.setArg(flags.deployPrometheusStack, false);
    });
  });

  describe('uninstallPodMonitorRole', (): void => {
    let tasks: ClusterCommandTasks;
    let rbacStub: any;

    afterEach((): void => {
      sandbox.restore();
    });

    beforeEach((): void => {
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      rbacStub = {
        clusterRoleExists: sandbox.stub(),
        deleteClusterRole: sandbox.stub().resolves(),
      };

      const k8Stub: Record<string, unknown> = {
        rbac: (): typeof rbacStub => rbacStub,
      };

      sandbox.stub(k8Factory, 'getK8').returns(k8Stub as unknown as ReturnType<K8Factory['getK8']>);

      tasks = container.resolve(InjectTokens.ClusterCommandTasks);
    });

    it('deletes ClusterRole when it exists', async (): Promise<void> => {
      rbacStub.clusterRoleExists.resolves(true);

      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallPodMonitorRole();
      await task.task(
        {config: {context: 'test-context'}} as unknown as ClusterReferenceResetContext,
        {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
      );

      expect(rbacStub.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
      expect(rbacStub.deleteClusterRole.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
    });

    it('does not delete ClusterRole when it does not exist', async (): Promise<void> => {
      rbacStub.clusterRoleExists.resolves(false);

      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallPodMonitorRole();
      await task.task(
        {config: {context: 'test-context'}} as unknown as ClusterReferenceResetContext,
        {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
      );

      expect(rbacStub.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
      expect(rbacStub.deleteClusterRole.notCalled).to.be.true;
    });

    it('throws error when clusterRoleExists API fails', async (): Promise<void> => {
      const apiError: Error = new Error('API unavailable');
      rbacStub.clusterRoleExists.rejects(apiError);

      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallPodMonitorRole();

      try {
        await task.task(
          {config: {context: 'test-context'}} as unknown as ClusterReferenceResetContext,
          {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
        );
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        expect((error as Error).message).to.include('Failed to check if ClusterRole exists');
      }

      expect(rbacStub.clusterRoleExists.calledOnceWith(constants.POD_MONITOR_ROLE)).to.be.true;
      expect(rbacStub.deleteClusterRole.notCalled).to.be.true;
    });
  });

  describe('MinIO Operator, whose CRDs outlive the namespace it was installed into', (): void => {
    const configuredNamespace: NamespaceName = NamespaceName.of('solo-cluster-setup');
    const installedNamespace: string = 'solo-setup';
    const soloChart: string = `${constants.MINIO_OPERATOR_CHART}-${MINIO_OPERATOR_VERSION}`;
    let tasks: ClusterCommandTasks;
    let chartManager: SinonStubbedInstance<ChartManager>;
    let clusterChecks: SinonStubbedInstance<ClusterChecks>;
    let crdsStub: {readLabels: SinonStub};

    afterEach((): void => {
      sandbox.restore();
    });

    beforeEach((): void => {
      const k8Factory: K8Factory = container.resolve(InjectTokens.K8Factory);
      // Undefined labels is how the client reports an absent CRD.
      crdsStub = {readLabels: sandbox.stub().resolves()};
      sandbox
        .stub(k8Factory, 'getK8')
        .returns({crds: (): typeof crdsStub => crdsStub} as unknown as ReturnType<K8Factory['getK8']>);

      // Stubbed through the sandbox rather than assigned over: a plain assignment is not undone by
      // sandbox.restore(), so the stubs would outlive this describe and leak into later suites.
      const resolvedChartManager: ChartManager = container.resolve(InjectTokens.ChartManager);
      sandbox.stub(resolvedChartManager, 'install').resolves(true);
      sandbox.stub(resolvedChartManager, 'uninstall').resolves(true);
      sandbox.stub(resolvedChartManager, 'getInstalledRelease').resolves();
      chartManager = resolvedChartManager as SinonStubbedInstance<ChartManager>;

      const resolvedClusterChecks: ClusterChecks = container.resolve(InjectTokens.ClusterChecks);
      sandbox.stub(resolvedClusterChecks, 'isRemoteConfigPresentInNamespace').resolves(false);
      clusterChecks = resolvedClusterChecks as SinonStubbedInstance<ClusterChecks>;

      tasks = container.resolve(InjectTokens.ClusterCommandTasks);
    });

    it('reuses the operator when a release owns the CRDs', async (): Promise<void> => {
      crdsStub.readLabels.resolves({'app.kubernetes.io/version': MINIO_OPERATOR_VERSION});
      chartManager.getInstalledRelease.resolves({
        name: constants.MINIO_OPERATOR_RELEASE_NAME,
        namespace: installedNamespace,
        chart: soloChart,
      } as unknown as ReleaseItem);

      await tasks.installMinioOperatorChart(configuredNamespace, 'test-context');

      expect(chartManager.install.notCalled).to.be.true;
    });

    // The state this PR is aimed at: the namespace was deleted, so the release secret went with it, but
    // the CRDs are cluster-scoped and survived. Skipping the install here would leave the Tenant created
    // later with no operator to reconcile it — a silent hang far from the cause.
    it('refuses to install over CRDs that no release owns', async (): Promise<void> => {
      crdsStub.readLabels.resolves({'app.kubernetes.io/version': MINIO_OPERATOR_VERSION});
      chartManager.getInstalledRelease.resolves();

      let thrown: SoloError | undefined;
      try {
        await tasks.installMinioOperatorChart(configuredNamespace, 'test-context');
      } catch (error) {
        thrown = error as SoloError;
      }

      expect(thrown, 'orphaned CRDs must be reported, not silently treated as an install').to.be.instanceOf(SoloError);
      expect(thrown.getFormattedCode()).to.equal('SOLO-2032');
      // The CRDs are named so the user knows exactly what to delete.
      expect(thrown.message).to.include(constants.MINIO_OPERATOR_CRDS[0]);
      expect(chartManager.install.notCalled).to.be.true;
    });

    it('installs when none of its CRDs are present', async (): Promise<void> => {
      await tasks.installMinioOperatorChart(configuredNamespace, 'test-context');

      expect(chartManager.install.calledOnce).to.be.true;
      expect(chartManager.install.args[0][0]).to.equal(configuredNamespace);
    });

    async function runUninstall(): Promise<void> {
      const task: SoloListrTask<ClusterReferenceResetContext> = tasks.uninstallMinioOperator();
      await task.task(
        {
          config: {context: 'test-context', clusterSetupNamespace: configuredNamespace},
        } as unknown as ClusterReferenceResetContext,
        {} as unknown as SoloListrTaskWrapper<ClusterReferenceResetContext>,
      );
    }

    it('uninstalls from the namespace the release is actually in, not the configured one', async (): Promise<void> => {
      chartManager.getInstalledRelease.resolves({
        name: constants.MINIO_OPERATOR_RELEASE_NAME,
        namespace: installedNamespace,
        chart: soloChart,
      } as unknown as ReleaseItem);
      // A namespace holding a solo remote config is one solo manages, so the release is solo's.
      clusterChecks.isRemoteConfigPresentInNamespace.resolves(true);

      await runUninstall();

      // Looked up across all namespaces, so a reset run against a different namespace still finds it.
      expect(chartManager.getInstalledRelease.args[0][0]).to.be.undefined;
      expect(chartManager.uninstall.args[0][0].name).to.equal(installedNamespace);
      expect(chartManager.uninstall.args[0][1]).to.equal(constants.MINIO_OPERATOR_RELEASE_NAME);
    });

    it('uninstalls without consulting remote config when it is in the cluster-setup namespace', async (): Promise<void> => {
      chartManager.getInstalledRelease.resolves({
        name: constants.MINIO_OPERATOR_RELEASE_NAME,
        namespace: configuredNamespace.name,
        chart: soloChart,
      } as unknown as ReleaseItem);

      await runUninstall();

      expect(chartManager.uninstall.calledOnce).to.be.true;
      expect(clusterChecks.isRemoteConfigPresentInNamespace.notCalled).to.be.true;
    });

    // `operator` is also the release name in MinIO's own documented install, so name alone is not
    // ownership. Reset must not remove a user's own operator from an unrelated namespace.
    it('leaves a foreign release named operator alone', async (): Promise<void> => {
      chartManager.getInstalledRelease.resolves({
        name: constants.MINIO_OPERATOR_RELEASE_NAME,
        namespace: 'someone-elses-namespace',
        chart: soloChart,
      } as unknown as ReleaseItem);
      clusterChecks.isRemoteConfigPresentInNamespace.resolves(false);

      await runUninstall();

      expect(chartManager.uninstall.notCalled).to.be.true;
    });

    it('leaves a release running a different chart alone', async (): Promise<void> => {
      chartManager.getInstalledRelease.resolves({
        name: constants.MINIO_OPERATOR_RELEASE_NAME,
        namespace: configuredNamespace.name,
        chart: 'some-other-operator-1.0.0',
      } as unknown as ReleaseItem);

      await runUninstall();

      expect(chartManager.uninstall.notCalled).to.be.true;
    });

    it('skips the uninstall when no release exists', async (): Promise<void> => {
      await runUninstall();

      expect(chartManager.uninstall.notCalled).to.be.true;
    });
  });
});
