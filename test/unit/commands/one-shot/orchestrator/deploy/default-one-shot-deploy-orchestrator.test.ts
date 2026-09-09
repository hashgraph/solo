// SPDX-License-Identifier: Apache-2.0

import {describe, it, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import {DefaultOneShotDeployOrchestrator} from '../../../../../../src/commands/one-shot/orchestrator/deploy/default-one-shot-deploy-orchestrator.js';
import {NamespaceName} from '../../../../../../src/types/namespace/namespace-name.js';
import {SoloError} from '../../../../../../src/core/errors/solo-error.js';
import {type OneShotSingleDeployConfigClass} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-config-class.js';
import {type DeploymentStateSnapshot} from '../../../../../../src/commands/one-shot/deployment-state-snapshot.js';
import {type OneShotSingleDeployContext} from '../../../../../../src/commands/one-shot/one-shot-single-deploy-context.js';
import {type OrchestratorPipeline} from '../../../../../../src/commands/one-shot/orchestrator/orchestrator-pipeline.js';
import {ComponentTypes} from '../../../../../../src/core/config/remote/enumerations/component-types.js';
import {DeploymentPhase} from '../../../../../../src/data/schema/model/remote/deployment-phase.js';
import {ConfirmationRequiredSoloError} from '../../../../../../src/core/errors/classes/validation/confirmation-required-solo-error.js';
import {UserBreak} from '../../../../../../src/core/errors/user-break.js';
import {Flags} from '../../../../../../src/commands/flags.js';

type MockType = any;
type MockListr = MockType;

function makeLogger(): MockType {
  return {info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub()};
}

function makeOrchestrator(
  overrides: {
    localConfig?: MockType;
    remoteConfig?: MockType;
    helm?: MockType;
    logger?: MockType;
    k8Factory?: MockType;
  } = {},
): DefaultOneShotDeployOrchestrator {
  return new DefaultOneShotDeployOrchestrator(
    {} as MockType,
    {} as MockType,
    {} as MockType,
    overrides.localConfig ?? ({} as MockType),
    overrides.remoteConfig ?? ({} as MockType),
    overrides.logger ?? makeLogger(),
    {} as MockType,
    {} as MockType,
    overrides.k8Factory ?? ({} as MockType),
    {} as MockType,
    {} as MockType,
    overrides.helm ?? ({} as MockType),
    {} as MockType,
    {} as MockType,
    {} as MockType,
  );
}

function makeLocalConfigWithDeployment(
  options: {deploymentName?: string; namespace?: string; clusterReference?: string; context?: string} = {},
): MockType {
  const clusterReference: string = options.clusterReference ?? 'one-shot';
  return {
    isLoaded: true,
    load: sinon.stub().resolves(),
    configuration: {
      deployments: [
        {
          name: options.deploymentName ?? 'one-shot',
          namespace: options.namespace ?? 'one-shot',
          clusters: [{toString: (): string => clusterReference}],
        },
      ],
      clusterRefs: new Map<string, {toString: () => string}>([
        [clusterReference, {toString: (): string => options.context ?? 'kind-solo'}],
      ]),
    },
  };
}

function makeK8Factory(existsStub: sinon.SinonStub): MockType {
  return {
    getK8: sinon.stub().returns({
      configMaps: (): MockType => ({exists: existsStub}),
    }),
  };
}

function makeConfig(overrides: Partial<OneShotSingleDeployConfigClass> = {}): OneShotSingleDeployConfigClass {
  return {
    relayNodeConfiguration: {},
    explorerNodeConfiguration: {},
    blockNodeConfiguration: {},
    mirrorNodeConfiguration: {},
    consensusNodeConfiguration: {},
    networkConfiguration: {},
    setupConfiguration: {},
    valuesFile: '',
    clusterRef: 'one-shot',
    context: 'kind-solo',
    deployment: 'one-shot',
    namespace: NamespaceName.of('one-shot'),
    numberOfConsensusNodes: 1,
    cacheDir: '/tmp/cache',
    predefinedAccounts: true,
    minimalSetup: false,
    deployMirrorNode: true,
    deployExplorer: true,
    deployRelay: true,
    deployMetricsServer: false,
    force: false,
    quiet: false,
    rollback: true,
    parallelDeploy: false,
    pinger: true,
    externalAddress: '',
    edgeEnabled: false,
    clusterHasOneShotPortMappings: true,
    versions: {
      soloChart: '',
      consensus: '',
      mirror: '',
      explorer: '',
      relay: '',
      blockNode: '',
    },
    argv: {_: []},
    ...overrides,
  };
}

function makeTaskWrapper(promptResult: boolean): MockListr {
  const runStub: sinon.SinonStub = sinon.stub().resolves(promptResult);
  const promptAdapterStub: sinon.SinonStub = sinon.stub().returns({run: runStub});

  return {
    prompt: promptAdapterStub,
  };
}

describe('DefaultOneShotDeployOrchestrator non-Kind context guard', (): void => {
  describe('buildNonKindContextWarningMessage', (): void => {
    it('includes the active context and warning details', (): void => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();

      // @ts-expect-error - to access private method
      const message: string = orchestrator.buildNonKindContextWarningMessage('gke-prod');

      expect(message).to.include("Active Kubernetes context 'gke-prod'");
      expect(message).to.include('not a local Kind cluster');
      expect(message).to.include('one-shot deploy is intended for local development');
      expect(message).to.include('Solo charts, CRDs, namespaces, and other resources');
      expect(message).to.include('Continue?');
    });
  });

  describe('confirmNonKindContext', (): void => {
    it('does not prompt when quiet mode is enabled', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(false);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'gke-prod',
          quiet: true,
        }),
        task,
      );

      expect(task.prompt).to.not.have.been.called;
    });

    it('does not prompt when the context is a Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(false);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'kind-solo',
          quiet: false,
        }),
        task,
      );

      expect(task.prompt).to.not.have.been.called;
    });

    it('prompts when the context is not a Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(true);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'gke-prod',
          quiet: false,
        }),
        task,
      );

      expect(task.prompt).to.have.been.calledOnce;
    });

    it('continues when the user confirms deployment to a non-Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(true);

      // @ts-expect-error - to access private method
      await orchestrator.confirmNonKindContext(
        makeConfig({
          context: 'gke-prod',
          quiet: false,
        }),
        task,
      );
    });

    it('throws when the user rejects deployment to a non-Kind context', async (): Promise<void> => {
      const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
      const task: MockListr = makeTaskWrapper(false);

      try {
        // @ts-expect-error - to access private method
        await orchestrator.confirmNonKindContext(
          makeConfig({
            context: 'gke-prod',
            quiet: false,
          }),
          task,
        );

        expect.fail('Expected confirmNonKindContext to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(SoloError);
        expect((error as Error).message).to.equal('Aborted by user');
      }
    });
  });
});

function makeRemoteConfig(loadError: string): MockType {
  return {
    load: sinon.stub().rejects(new Error(loadError)),
    isLoaded: sinon.stub().returns(false),
    getComponentPhasesMap: sinon.stub().returns(new Map()),
  };
}

async function buildSnapshot(
  overrides: Parameters<typeof makeOrchestrator>[0],
  config: OneShotSingleDeployConfigClass = makeConfig(),
): Promise<DeploymentStateSnapshot> {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator(overrides);
  // @ts-expect-error - to access private method
  return await orchestrator.buildDeploymentStateSnapshot(config);
}

function orphanOverrides(
  existsStub: sinon.SinonStub,
  localConfig: MockType = makeLocalConfigWithDeployment(),
): Parameters<typeof makeOrchestrator>[0] {
  return {
    localConfig,
    remoteConfig: makeRemoteConfig('ConfigMap not found'),
    helm: {listReleases: sinon.stub().resolves([])},
    k8Factory: makeK8Factory(existsStub),
  };
}

describe('DefaultOneShotDeployOrchestrator buildDeploymentStateSnapshot', (): void => {
  afterEach((): void => {
    sinon.restore();
  });

  it('returns conservative defaults when remoteConfig.load() throws', async (): Promise<void> => {
    const snapshot: DeploymentStateSnapshot = await buildSnapshot({
      localConfig: {isLoaded: false},
      remoteConfig: makeRemoteConfig('K8s unreachable'),
      helm: {listReleases: sinon.stub().resolves([])},
    });

    expect(snapshot.remoteConfig.configMapExists).to.be.false;
    expect(snapshot.remoteConfig.componentPhases.size).to.equal(0);
  });

  it('returns conservative defaults when helm.listReleases() throws', async (): Promise<void> => {
    const snapshot: DeploymentStateSnapshot = await buildSnapshot({
      localConfig: {isLoaded: false},
      remoteConfig: makeRemoteConfig('ConfigMap not found'),
      helm: {listReleases: sinon.stub().rejects(new Error('Helm unavailable'))},
    });

    expect(snapshot.helm.installedReleases.size).to.equal(0);
  });

  it('populates installedReleases from helm when available', async (): Promise<void> => {
    const snapshot: DeploymentStateSnapshot = await buildSnapshot({
      localConfig: {isLoaded: false},
      remoteConfig: makeRemoteConfig('no config'),
      helm: {
        listReleases: sinon.stub().resolves([
          {
            name: 'solo-deployment',
            namespace: 'one-shot',
            revision: '1',
            updated: '',
            status: 'deployed',
            chart: '',
            app_version: '',
          },
          {
            name: 'solo-cluster-setup',
            namespace: 'one-shot',
            revision: '1',
            updated: '',
            status: 'deployed',
            chart: '',
            app_version: '',
          },
        ]),
      },
    });

    expect(snapshot.helm.installedReleases.has('solo-deployment')).to.be.true;
    expect(snapshot.helm.installedReleases.has('solo-cluster-setup')).to.be.true;
  });

  describe('orphanedOnKindCluster', (): void => {
    it('is true when the recorded deployment has lost its ConfigMap on a kind cluster', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(orphanOverrides(existsStub));

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.true;
      // The deployment's recorded namespace is probed, not the namespace resolved for this run.
      expect(existsStub.firstCall.args[0].name).to.equal('one-shot');
      expect(existsStub.firstCall.args[1]).to.equal('solo-remote-config');
    });

    it("probes the deployment's recorded namespace rather than the run's namespace", async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);
      const localConfig: MockType = makeLocalConfigWithDeployment({namespace: 'recorded-namespace'});

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(
        orphanOverrides(existsStub, localConfig),
        makeConfig({namespace: NamespaceName.of('resolved-namespace')}),
      );

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.true;
      expect(existsStub.firstCall.args[0].name).to.equal('recorded-namespace');
    });

    it('is false when the ConfigMap is present', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(true);

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(orphanOverrides(existsStub));

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
    });

    it('is false on a non-kind context, without probing the cluster', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);
      const localConfig: MockType = makeLocalConfigWithDeployment({context: 'gke_project_region_cluster'});

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(
        orphanOverrides(existsStub, localConfig),
        makeConfig({context: 'gke_project_region_cluster'}),
      );

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
      expect(existsStub.called).to.be.false;
    });

    it('is false when the local config does not record the deployment', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);
      const localConfig: MockType = makeLocalConfigWithDeployment({deploymentName: 'another-deployment'});

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(orphanOverrides(existsStub, localConfig));

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
      expect(existsStub.called).to.be.false;
    });

    it('is false when the recorded deployment is attached to a different cluster', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);
      const localConfig: MockType = makeLocalConfigWithDeployment({
        clusterReference: 'other-cluster',
        context: 'kind-other',
      });

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(orphanOverrides(existsStub, localConfig));

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
      expect(existsStub.called).to.be.false;
    });

    it('is false when the cluster is unreachable, and the snapshot still returns', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().rejects(new Error('connection refused'));

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(orphanOverrides(existsStub));

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
    });

    it('is false when the local config cannot be read, and the snapshot still returns', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);
      const localConfig: MockType = {
        isLoaded: false,
        get configuration(): never {
          throw new SoloError('Local configuration is not loaded yet');
        },
      };

      const snapshot: DeploymentStateSnapshot = await buildSnapshot(orphanOverrides(existsStub, localConfig));

      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
    });

    it('is not probed when the remote config loaded successfully', async (): Promise<void> => {
      const existsStub: sinon.SinonStub = sinon.stub().resolves(false);

      const snapshot: DeploymentStateSnapshot = await buildSnapshot({
        localConfig: makeLocalConfigWithDeployment(),
        remoteConfig: {
          load: sinon.stub().resolves(),
          isLoaded: sinon.stub().returns(true),
          getComponentPhasesMap: sinon.stub().returns(new Map()),
        },
        helm: {listReleases: sinon.stub().resolves([])},
        k8Factory: makeK8Factory(existsStub),
      });

      expect(snapshot.remoteConfig.configMapExists).to.be.true;
      expect(snapshot.remoteConfig.orphanedOnKindCluster).to.be.false;
      expect(existsStub.called).to.be.false;
    });
  });
});

function createAccountsSkip(config: OneShotSingleDeployConfigClass): boolean {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
  // @ts-expect-error - to access private method
  const task: {skip: () => boolean} = orchestrator.buildCreateAccountsTask(config);
  return task.skip();
}

describe('DefaultOneShotDeployOrchestrator Create Accounts skip guard', (): void => {
  it('skips when predefined accounts are disabled', (): void => {
    expect(createAccountsSkip(makeConfig({predefinedAccounts: false}))).to.be.true;
  });

  it('runs when predefined accounts are enabled', (): void => {
    expect(createAccountsSkip(makeConfig({predefinedAccounts: true}))).to.be.false;
  });
});

function makeSnapshot(overrides: Partial<DeploymentStateSnapshot> = {}): DeploymentStateSnapshot {
  return {
    remoteConfig: {
      configMapExists: false,
      componentPhases: new Map<ComponentTypes, DeploymentPhase>(),
      orphanedOnKindCluster: false,
    },
    helm: {installedReleases: new Set<string>()},
    accounts: {accountsFileExists: false},
    ...overrides,
  };
}

function invokeHasExistingOneShotState(snapshot: DeploymentStateSnapshot | undefined): boolean {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
  // @ts-expect-error - to access private method
  return orchestrator.hasExistingOneShotState(snapshot);
}

function invokeAutoCleanConfirmationMessage(snapshot: DeploymentStateSnapshot | undefined): string {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
  // @ts-expect-error - to access private method
  return orchestrator.buildAutoCleanConfirmationMessage(snapshot);
}

describe('DefaultOneShotDeployOrchestrator hasExistingOneShotState', (): void => {
  it('returns false when the snapshot is undefined', (): void => {
    const noSnapshot: DeploymentStateSnapshot | undefined = undefined;
    expect(invokeHasExistingOneShotState(noSnapshot)).to.be.false;
  });

  it('returns false when all fields are empty', (): void => {
    expect(invokeHasExistingOneShotState(makeSnapshot())).to.be.false;
  });

  it('returns true when the remote ConfigMap exists', (): void => {
    expect(
      invokeHasExistingOneShotState(
        makeSnapshot({remoteConfig: {configMapExists: true, componentPhases: new Map(), orphanedOnKindCluster: false}}),
      ),
    ).to.be.true;
  });

  it('returns true when the recorded deployment is orphaned on a kind cluster', (): void => {
    expect(
      invokeHasExistingOneShotState(
        makeSnapshot({remoteConfig: {configMapExists: false, componentPhases: new Map(), orphanedOnKindCluster: true}}),
      ),
    ).to.be.true;
  });

  it('returns true when a Helm release is installed', (): void => {
    expect(
      invokeHasExistingOneShotState(makeSnapshot({helm: {installedReleases: new Set<string>(['solo-deployment'])}})),
    ).to.be.true;
  });

  it('returns true when the accounts file exists', (): void => {
    expect(invokeHasExistingOneShotState(makeSnapshot({accounts: {accountsFileExists: true}}))).to.be.true;
  });

  it('returns true when a component phase is at DEPLOYED', (): void => {
    expect(
      invokeHasExistingOneShotState(
        makeSnapshot({
          remoteConfig: {
            configMapExists: false,
            componentPhases: new Map([[ComponentTypes.MirrorNode, DeploymentPhase.DEPLOYED]]),
            orphanedOnKindCluster: false,
          },
        }),
      ),
    ).to.be.true;
  });

  it('returns false when the only component phase is below DEPLOYED', (): void => {
    expect(
      invokeHasExistingOneShotState(
        makeSnapshot({
          remoteConfig: {
            configMapExists: false,
            componentPhases: new Map([[ComponentTypes.MirrorNode, DeploymentPhase.REQUESTED]]),
            orphanedOnKindCluster: false,
          },
        }),
      ),
    ).to.be.false;
  });
});

describe('DefaultOneShotDeployOrchestrator buildAutoCleanConfirmationMessage', (): void => {
  it('lists the remote config, Helm releases, and accounts file', (): void => {
    const message: string = invokeAutoCleanConfirmationMessage(
      makeSnapshot({
        remoteConfig: {configMapExists: true, componentPhases: new Map(), orphanedOnKindCluster: false},
        helm: {installedReleases: new Set<string>(['solo-deployment'])},
        accounts: {accountsFileExists: true},
      }),
    );
    expect(message).to.include('remote config (ConfigMap)');
    expect(message).to.include('solo-deployment');
    expect(message).to.include('accounts file on disk');
  });

  it('names the missing remote config when that is the only detected state', (): void => {
    const message: string = invokeAutoCleanConfirmationMessage(
      makeSnapshot({remoteConfig: {configMapExists: false, componentPhases: new Map(), orphanedOnKindCluster: true}}),
    );
    expect(message).to.include('remote config (ConfigMap) is missing');
    expect(message).to.not.include('accounts file on disk');
  });

  it('lists detected component phases so the dialog is never blank', (): void => {
    const message: string = invokeAutoCleanConfirmationMessage(
      makeSnapshot({
        remoteConfig: {
          configMapExists: false,
          componentPhases: new Map([[ComponentTypes.Explorer, DeploymentPhase.DEPLOYED]]),
          orphanedOnKindCluster: false,
        },
      }),
    );
    expect(message).to.match(/component .* in phase/);
  });
});

function makeMinimalOrchestrator(): DefaultOneShotDeployOrchestrator {
  return new DefaultOneShotDeployOrchestrator(
    {} as MockType,
    {
      emit: sinon.stub(),
      waitFor: sinon.stub(),
      abort: sinon.stub(),
      abortReason: sinon.stub(),
      reset: sinon.stub(),
    } as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {info: sinon.stub()} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
    {} as MockType,
  );
}

function getConfirmCleanupPhase(): MockType {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
  const pipeline: OrchestratorPipeline<OneShotSingleDeployContext> = orchestrator.buildDeployPipeline(
    {_: []} as MockType,
    {required: [], optional: []} as MockType,
    {} as MockType,
    {} as MockType,
  );
  return (pipeline.tasks as MockType[]).find(
    (task: MockType): boolean => task.title === 'Confirm cleanup of existing deployment state',
  );
}

describe('DefaultOneShotDeployOrchestrator Confirm cleanup of existing deployment state phase', (): void => {
  const existingState: DeploymentStateSnapshot = makeSnapshot({
    remoteConfig: {configMapExists: true, componentPhases: new Map(), orphanedOnKindCluster: false},
  });

  it('skips when there is no pre-existing state', (): void => {
    const phase: MockType = getConfirmCleanupPhase();
    expect(phase.skip({config: makeConfig(), deploymentStateSnapshot: makeSnapshot()})).to.be.true;
  });

  it('does not skip when pre-existing state is detected', (): void => {
    const phase: MockType = getConfirmCleanupPhase();
    expect(phase.skip({config: makeConfig(), deploymentStateSnapshot: existingState})).to.be.false;
  });

  it('throws ConfirmationRequiredSoloError under --quiet', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(true);
    try {
      await phase.task({config: makeConfig({quiet: true}), deploymentStateSnapshot: existingState}, task);
      expect.fail('expected ConfirmationRequiredSoloError to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(ConfirmationRequiredSoloError);
      expect(task.prompt).to.not.have.been.called;
    }
  });

  it('throws ConfirmationRequiredSoloError under --force', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(true);
    try {
      await phase.task({config: makeConfig({force: true}), deploymentStateSnapshot: existingState}, task);
      expect.fail('expected ConfirmationRequiredSoloError to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(ConfirmationRequiredSoloError);
      expect(task.prompt).to.not.have.been.called;
    }
  });

  it('proceeds when the user confirms', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(true);
    await phase.task({config: makeConfig(), deploymentStateSnapshot: existingState}, task);
    expect(task.prompt).to.have.been.calledOnce;
  });

  describe('when the recorded deployment is orphaned on a kind cluster', (): void => {
    const orphanedState: DeploymentStateSnapshot = makeSnapshot({
      remoteConfig: {configMapExists: false, componentPhases: new Map(), orphanedOnKindCluster: true},
    });

    it('does not skip, so the destroy that follows is offered', (): void => {
      const phase: MockType = getConfirmCleanupPhase();
      expect(phase.skip({config: makeConfig(), deploymentStateSnapshot: orphanedState})).to.be.false;
    });

    it('prompts before destroying anything', async (): Promise<void> => {
      const phase: MockType = getConfirmCleanupPhase();
      const task: MockListr = makeTaskWrapper(true);
      await phase.task({config: makeConfig(), deploymentStateSnapshot: orphanedState}, task);
      expect(task.prompt).to.have.been.calledOnce;
    });

    // A destroy must never run unattended: --quiet/--force are used where a prompt cannot be
    // answered, so solo fails and leaves the operator to add an explicit destroy to their script.
    it('throws ConfirmationRequiredSoloError under --quiet', async (): Promise<void> => {
      const phase: MockType = getConfirmCleanupPhase();
      const task: MockListr = makeTaskWrapper(true);
      try {
        await phase.task({config: makeConfig({quiet: true}), deploymentStateSnapshot: orphanedState}, task);
        expect.fail('expected ConfirmationRequiredSoloError to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(ConfirmationRequiredSoloError);
        expect(task.prompt).to.not.have.been.called;
      }
    });

    it('throws ConfirmationRequiredSoloError under --force', async (): Promise<void> => {
      const phase: MockType = getConfirmCleanupPhase();
      const task: MockListr = makeTaskWrapper(true);
      try {
        await phase.task({config: makeConfig({force: true}), deploymentStateSnapshot: orphanedState}, task);
        expect.fail('expected ConfirmationRequiredSoloError to be thrown');
      } catch (error) {
        expect(error).to.be.instanceOf(ConfirmationRequiredSoloError);
        expect(task.prompt).to.not.have.been.called;
      }
    });
  });

  it('throws UserBreak when the user declines', async (): Promise<void> => {
    const phase: MockType = getConfirmCleanupPhase();
    const task: MockListr = makeTaskWrapper(false);
    try {
      await phase.task({config: makeConfig(), deploymentStateSnapshot: existingState}, task);
      expect.fail('expected UserBreak to be thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(UserBreak);
    }
  });
});

function getPipelineTasks(): MockType[] {
  const orchestrator: DefaultOneShotDeployOrchestrator = makeMinimalOrchestrator();
  const pipeline: OrchestratorPipeline<OneShotSingleDeployContext> = orchestrator.buildDeployPipeline(
    {_: []} as MockType,
    {required: [], optional: []} as MockType,
    {} as MockType,
    {} as MockType,
  );
  return pipeline.tasks as MockType[];
}

describe('DefaultOneShotDeployOrchestrator pipeline does not duplicate the existing-deployment confirmation (#5944)', (): void => {
  it('does not contain a "Check for other deployments" phase', (): void => {
    const tasks: MockType[] = getPipelineTasks();
    const checkForOtherDeployments: MockType | undefined = tasks.find(
      (task: MockType): boolean => task.title === 'Check for other deployments',
    );
    expect(checkForOtherDeployments).to.be.undefined;
  });

  it('contains exactly one confirmation phase that gates on existing deployment state', (): void => {
    const tasks: MockType[] = getPipelineTasks();
    const confirmationPhases: MockType[] = tasks.filter(
      (task: MockType): boolean => task.title === 'Confirm cleanup of existing deployment state',
    );
    expect(confirmationPhases).to.have.lengthOf(1);
  });

  it('the self-healing confirmation does not skip when existing state is detected', (): void => {
    const tasks: MockType[] = getPipelineTasks();
    const confirmPhase: MockType = tasks.find(
      (task: MockType): boolean => task.title === 'Confirm cleanup of existing deployment state',
    );
    expect(confirmPhase).to.not.be.undefined;
    const existingState: DeploymentStateSnapshot = makeSnapshot({
      remoteConfig: {configMapExists: true, componentPhases: new Map(), orphanedOnKindCluster: false},
    });
    expect(confirmPhase.skip({config: makeConfig(), deploymentStateSnapshot: existingState})).to.be.false;
  });

  it('the self-healing confirmation skips when there is no pre-existing state', (): void => {
    const tasks: MockType[] = getPipelineTasks();
    const confirmPhase: MockType = tasks.find(
      (task: MockType): boolean => task.title === 'Confirm cleanup of existing deployment state',
    );
    expect(confirmPhase).to.not.be.undefined;
    expect(confirmPhase.skip({config: makeConfig(), deploymentStateSnapshot: makeSnapshot()})).to.be.true;
  });
});

describe('DefaultOneShotDeployOrchestrator reconcileEffectiveVersions', (): void => {
  const releaseTagKey: string = Flags.getFormattedFlagKey(Flags.consensusNodeVersion);
  const soloChartVersionKey: string = Flags.getFormattedFlagKey(Flags.soloChartVersion);
  const blockNodeVersionKey: string = Flags.getFormattedFlagKey(Flags.blockNodeVersion);
  const mirrorNodeVersionKey: string = Flags.getFormattedFlagKey(Flags.mirrorNodeVersion);
  const explorerVersionKey: string = Flags.getFormattedFlagKey(Flags.explorerVersion);
  const relayVersionKey: string = Flags.getFormattedFlagKey(Flags.relayVersion);

  it('leaves the resolved versions untouched when no values file overrides are present', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
    const config: OneShotSingleDeployConfigClass = makeConfig({
      versions: {
        soloChart: '0.64.0',
        consensus: 'v0.74.0',
        mirror: 'v0.158.0',
        explorer: '26.1.0',
        relay: '0.77.0',
        blockNode: '0.38.0',
      },
    });

    // @ts-expect-error - to access private method
    orchestrator.reconcileEffectiveVersions(config);

    expect(config.versions.consensus).to.equal('v0.74.0');
    expect(config.versions.soloChart).to.equal('0.64.0');
    expect(config.versions.blockNode).to.equal('0.38.0');
    expect(config.versions.mirror).to.equal('v0.158.0');
    expect(config.versions.explorer).to.equal('26.1.0');
    expect(config.versions.relay).to.equal('0.77.0');
  });

  it('reflects a consensus node version overridden via the values file network/setup sections', (): void => {
    // Reproduces https://github.com/hiero-ledger/solo/issues/5384: a values file that only sets
    // --consensus-node-version under `network`/`setup` (not as a top-level CLI flag) must be
    // reflected in the printed "Versions Used" summary, not just in the actual deployment.
    const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
    const config: OneShotSingleDeployConfigClass = makeConfig({
      networkConfiguration: {[releaseTagKey]: 'v0.77.0-rc.2'},
      setupConfiguration: {[releaseTagKey]: 'v0.77.0-rc.2'},
      versions: {
        soloChart: '0.64.0',
        consensus: 'v0.74.0',
        mirror: 'v0.158.0',
        explorer: '26.1.0',
        relay: '0.77.0',
        blockNode: '0.38.0',
      },
    });

    // @ts-expect-error - to access private method
    orchestrator.reconcileEffectiveVersions(config);

    expect(config.versions.consensus).to.equal('v0.77.0-rc.2');
  });

  it('reflects per-component version overrides for block, mirror, explorer, and relay nodes', (): void => {
    const orchestrator: DefaultOneShotDeployOrchestrator = makeOrchestrator();
    const config: OneShotSingleDeployConfigClass = makeConfig({
      networkConfiguration: {[soloChartVersionKey]: '0.65.0'},
      blockNodeConfiguration: {[blockNodeVersionKey]: '0.39.0'},
      mirrorNodeConfiguration: {[mirrorNodeVersionKey]: 'v0.159.0'},
      explorerNodeConfiguration: {[explorerVersionKey]: '26.2.0'},
      relayNodeConfiguration: {[relayVersionKey]: '0.78.0'},
      versions: {
        soloChart: '0.64.0',
        consensus: 'v0.74.0',
        mirror: 'v0.158.0',
        explorer: '26.1.0',
        relay: '0.77.0',
        blockNode: '0.38.0',
      },
    });

    // @ts-expect-error - to access private method
    orchestrator.reconcileEffectiveVersions(config);

    expect(config.versions.soloChart).to.equal('0.65.0');
    expect(config.versions.blockNode).to.equal('0.39.0');
    expect(config.versions.mirror).to.equal('v0.159.0');
    expect(config.versions.explorer).to.equal('26.2.0');
    expect(config.versions.relay).to.equal('0.78.0');
  });
});
