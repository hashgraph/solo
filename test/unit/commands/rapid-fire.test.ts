// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {container} from 'tsyringe-neo';
import {RapidFireCommand} from '../../../src/commands/rapid-fire.js';
import {NlgResultStatus} from '../../../src/commands/rapid-fire/nlg-result-status.js';
import {resetForTest} from '../../test-container.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {PodName} from '../../../src/integration/kube/resources/pod/pod-name.js';
import {PodReference} from '../../../src/integration/kube/resources/pod/pod-reference.js';
import * as constants from '../../../src/core/constants.js';

interface NlgResultForTest {
  status: NlgResultStatus;
  testClass: string;
  performanceTest: string;
  transactionCount?: number;
  durationSeconds?: number;
  tps?: number;
  rttMilliseconds?: number;
}

interface RapidFireCommandInternals {
  analyzeNlgOutput(output: string, testClass: string, performanceTest: string): NlgResultForTest;
  mirrorTransactionIsAvailable(
    port: number,
    mirrorTransactionId: string,
    requestTimeoutMilliseconds: number,
    logger?: unknown,
  ): Promise<boolean>;
  mirrorImporterLagMilliseconds(port: number, requestTimeoutMilliseconds: number): Promise<number | undefined>;
  mirrorReadinessPollTimeout(config: {rttPollTimeout: number}): number;
}

describe('RapidFireCommand', (): void => {
  const internals: RapidFireCommandInternals = RapidFireCommand as unknown as RapidFireCommandInternals;
  const performanceTest: string = 'TokenTransferLoadTest';
  const testClass: string = `com.hedera.benchmark.${performanceTest}`;
  let originalFetch: typeof fetch;

  beforeEach((): void => {
    originalFetch = globalThis.fetch;
  });

  afterEach((): void => {
    globalThis.fetch = originalFetch;
  });

  describe('analyzeNlgOutput', (): void => {
    it('extracts rttMilliseconds from end-to-end mirror RTT output', (): void => {
      const output: string = [
        'Max end-to-end mirror RTT: 499 ms',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(499);
    });

    it('extracts rttMilliseconds from verbose end-to-end RTT output', (): void => {
      const output: string = [
        'End to end mirror round trip time: 501 milliseconds',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(501);
    });

    it('returns undefined rttMilliseconds when no RTT line is present', (): void => {
      const output: string = 'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10';

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(undefined);
    });

    it('converts seconds to milliseconds before storing rttMilliseconds', (): void => {
      const output: string = [
        'P95 end-to-end mirror round trip time: 0.6 seconds',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(600);
    });

    it('parses RTT output when the unit appears before the value', (): void => {
      const output: string = [
        'Max mirror RTT (ms): 501',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(501);
    });

    it('does not parse consensus-only RTT lines as mirror RTT', (): void => {
      const output: string = [
        'Consensus RTT: 499 ms',
        'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10',
      ].join('\n');

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(undefined);
    });

    it('returns success when no RTT threshold is configured', (): void => {
      const output: string = 'Finished TokenTransferLoadTest: 100 transferred in 10 sec, TPS: 10';

      const result: NlgResultForTest = internals.analyzeNlgOutput(output, testClass, performanceTest);

      expect(result.status).to.equal(NlgResultStatus.SUCCESS);
      expect(result.rttMilliseconds).to.equal(undefined);
    });
  });

  describe('mirrorTransactionIsAvailable', (): void => {
    it('returns true when mirror REST includes the transaction id', async (): Promise<void> => {
      const mirrorTransactionId: string = '0.0.2-123-000000456';
      globalThis.fetch = (async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
        expect(input.toString()).to.equal(`http://localhost:38081/api/v1/transactions/${mirrorTransactionId}`);
        return Response.json(
          {transactions: [{transaction_id: mirrorTransactionId}]},
          {
            status: 200,
          },
        );
      }) as typeof fetch;

      const result: boolean = await internals.mirrorTransactionIsAvailable(38_081, mirrorTransactionId, 1000);

      expect(result).to.equal(true);
    });

    it('returns false when mirror REST responds without the transaction id', async (): Promise<void> => {
      const mirrorTransactionId: string = '0.0.2-123-000000456';
      globalThis.fetch = (async (): Promise<Response> =>
        Response.json(
          {transactions: [{transaction_id: '0.0.2-124-000000456'}]},
          {
            status: 200,
          },
        )) as typeof fetch;

      const result: boolean = await internals.mirrorTransactionIsAvailable(38_081, mirrorTransactionId, 1000);

      expect(result).to.equal(false);
    });

    it('returns false when the mirror REST request times out', async (): Promise<void> => {
      const mirrorTransactionId: string = '0.0.2-123-000000456';
      globalThis.fetch = ((
        _input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> =>
        new Promise<Response>((_resolve: (value: Response) => void, reject: (reason?: unknown) => void): void => {
          const signal: AbortSignal | null | undefined = init?.signal;
          if (!signal) {
            reject(new Error('fetch was called without an abort signal'));
            return;
          }

          signal.addEventListener(
            'abort',
            (): void => {
              reject(new Error('request aborted'));
            },
            {once: true},
          );
        })) as typeof fetch;

      const result: boolean = await internals.mirrorTransactionIsAvailable(38_081, mirrorTransactionId, 1);

      expect(result).to.equal(false);
    });
  });

  describe('mirrorImporterLagMilliseconds', (): void => {
    it('returns lag in milliseconds from the latest consensus timestamp', async (): Promise<void> => {
      const nowSeconds: number = Date.now() / 1000;
      const fiveSecondsAgo: string = `${(nowSeconds - 5).toFixed(9)}`;
      globalThis.fetch = (async (): Promise<Response> =>
        Response.json({transactions: [{consensus_timestamp: fiveSecondsAgo}]}, {status: 200})) as typeof fetch;

      const lag: number | undefined = await internals.mirrorImporterLagMilliseconds(38_081, 1000);

      expect(lag).to.be.greaterThanOrEqual(4000);
      expect(lag).to.be.lessThan(10_000);
    });

    it('returns undefined when mirror REST is not reachable', async (): Promise<void> => {
      globalThis.fetch = (async (): Promise<Response> => {
        throw new Error('ECONNREFUSED');
      }) as typeof fetch;

      const lag: number | undefined = await internals.mirrorImporterLagMilliseconds(38_081, 1000);

      expect(lag).to.equal(undefined);
    });

    it('returns undefined when transactions list is empty', async (): Promise<void> => {
      globalThis.fetch = (async (): Promise<Response> =>
        Response.json({transactions: []}, {status: 200})) as typeof fetch;

      const lag: number | undefined = await internals.mirrorImporterLagMilliseconds(38_081, 1000);

      expect(lag).to.equal(undefined);
    });
  });

  describe('mirrorReadinessPollTimeout', (): void => {
    it('uses a longer catch-up timeout before measured RTT samples start', (): void => {
      expect(internals.mirrorReadinessPollTimeout({rttPollTimeout: 30_000})).to.equal(900_000);
    });
  });
});

interface StopContext {
  config: {
    performanceTest: string;
    packageName: string;
    context: string;
    namespace: NamespaceName;
  };
}

interface RapidFireCommandStopAccessor {
  stopLoadTest(): {task: (context_: StopContext, task: {title: string}) => Promise<void>};
  k8Factory: K8Factory;
}

describe('RapidFireCommand stopLoadTest', (): void => {
  let rapidFireCommand: RapidFireCommand;
  let execContainerStub: SinonStub;
  let podsListStub: SinonStub;

  const stopContext: StopContext = {
    config: {
      performanceTest: 'TokenTransferLoadTest',
      packageName: 'com.hedera.benchmark',
      context: 'kind-solo-cluster',
      namespace: NamespaceName.of('test-ns'),
    },
  };
  const taskWrapper: {title: string} = {title: ''};

  beforeEach((): void => {
    resetForTest();
    rapidFireCommand = container.resolve(RapidFireCommand);

    execContainerStub = sinon.stub().resolves('');
    const containerStub: unknown = {execContainer: execContainerStub};
    podsListStub = sinon.stub();

    const k8ClientStub: unknown = {
      pods: sinon.stub().returns({list: podsListStub}),
      containers: sinon.stub().returns({readByRef: sinon.stub().returns(containerStub)}),
    };

    sinon
      .stub((rapidFireCommand as unknown as RapidFireCommandStopAccessor).k8Factory, 'getK8')
      .returns(k8ClientStub as unknown as K8);
  });

  afterEach((): void => {
    sinon.restore();
  });

  it('skips pods that are not Running', async (): Promise<void> => {
    const podReference: PodReference = PodReference.of(NamespaceName.of('test-ns'), PodName.of('nlg-pod-1'));
    const pendingPod: unknown = {phase: 'Pending', podReference};
    podsListStub.resolves([pendingPod]);

    const taskDefinition: ReturnType<RapidFireCommandStopAccessor['stopLoadTest']> = (
      rapidFireCommand as unknown as RapidFireCommandStopAccessor
    ).stopLoadTest();
    await taskDefinition.task(stopContext, taskWrapper);

    expect(execContainerStub.called).to.equal(false);
  });

  it('runs pgrep then pkill on Running pods when the process exists', async (): Promise<void> => {
    const podReference: PodReference = PodReference.of(NamespaceName.of('test-ns'), PodName.of('nlg-pod-1'));
    const runningPod: unknown = {phase: constants.POD_PHASE_RUNNING, podReference};
    podsListStub.resolves([runningPod]);

    const testClass: string = `${stopContext.config.packageName}.${stopContext.config.performanceTest}`;
    const taskDefinition: ReturnType<RapidFireCommandStopAccessor['stopLoadTest']> = (
      rapidFireCommand as unknown as RapidFireCommandStopAccessor
    ).stopLoadTest();
    await taskDefinition.task(stopContext, taskWrapper);

    expect(execContainerStub.calledTwice).to.equal(true);
    expect(execContainerStub.firstCall.args[0]).to.equal(`pgrep -f ${testClass}`);
    expect(execContainerStub.secondCall.args[0]).to.equal(`pkill -f ${testClass}`);
  });

  it('skips pkill on Running pods when pgrep finds no process', async (): Promise<void> => {
    const podReference: PodReference = PodReference.of(NamespaceName.of('test-ns'), PodName.of('nlg-pod-1'));
    const runningPod: unknown = {phase: constants.POD_PHASE_RUNNING, podReference};
    podsListStub.resolves([runningPod]);
    execContainerStub.rejects(new Error('command terminated with exit code 1'));

    const taskDefinition: ReturnType<RapidFireCommandStopAccessor['stopLoadTest']> = (
      rapidFireCommand as unknown as RapidFireCommandStopAccessor
    ).stopLoadTest();
    await taskDefinition.task(stopContext, taskWrapper);

    expect(execContainerStub.calledOnce).to.equal(true);
  });
});
