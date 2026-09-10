// SPDX-License-Identifier: Apache-2.0

import sinon, {type SinonStub} from 'sinon';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {expect} from 'chai';
import {OrchestratorPipelinePhase} from '../../../../../src/commands/one-shot/orchestrator/orchestrator-pipeline-phase.js';
import {type OrchestratorStep} from '../../../../../src/commands/one-shot/orchestrator/orchestrator-step.js';
import {type SoloEventBus} from '../../../../../src/core/events/solo-event-bus.js';
import {SoloEventType} from '../../../../../src/core/events/event-types/solo-event.js';
import {InjectedFailureSoloError} from '../../../../../src/core/errors/classes/internal/injected-failure-solo-error.js';
import {Duration} from '../../../../../src/core/time/duration.js';
import {type SoloListrTask, type SoloListrTaskWrapper} from '../../../../../src/types/index.js';
import {type AnyObject} from '../../../../../src/types/aliases.js';

type SimpleConfig = {deployment: string};
type SimpleContext = AnyObject;

describe('Phase', (): void => {
  let stepTaskStub: SoloListrTask<SimpleContext>;
  let stepStub: OrchestratorStep<SimpleConfig, SimpleContext>;
  let asListrTaskStub: SinonStub;
  let eventBusStub: SoloEventBus;
  let waitForStub: SinonStub;
  let abortStub: SinonStub;
  const config: SimpleConfig = {deployment: 'test-deployment'};

  beforeEach((): void => {
    stepTaskStub = {title: 'stub-step-task'} as SoloListrTask<SimpleContext>;
    asListrTaskStub = sinon.stub().returns(stepTaskStub);
    stepStub = {asListrTask: asListrTaskStub};
    waitForStub = sinon.stub().resolves({deployment: 'test-deployment'});
    abortStub = sinon.stub();
    eventBusStub = {waitFor: waitForStub, abort: abortStub} as unknown as SoloEventBus;
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('withWaitCondition', (): void => {
    it('is chainable and returns the same Phase instance', (): void => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      );
      const result: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = phase.withWaitCondition(
        SoloEventType.MirrorNodeDeployed,
      );
      expect(result).to.equal(phase);
    });
  });

  describe('asListrTask (no wait conditions)', (): void => {
    it('returns the same step task object (abort wrapping is applied in place)', (): void => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(task).to.equal(stepTaskStub);
      expect(asListrTaskStub.calledOnce).to.be.true;
      const getConfigArgument: () => SimpleConfig = asListrTaskStub.firstCall.args[0] as () => SimpleConfig;
      expect(getConfigArgument()).to.equal(config);
    });

    it('does not call eventBus.waitFor', (): void => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      );
      phase.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(waitForStub.called).to.be.false;
    });
  });

  describe('abort on leaf failure', (): void => {
    it('aborts the event bus with the thrown error and re-throws when the leaf task fails', async (): Promise<void> => {
      const failure: Error = new Error('leaf task failed');
      stepTaskStub = {
        title: 'stub-step-task',
        task: sinon.stub().rejects(failure),
      } as unknown as SoloListrTask<SimpleContext>;
      asListrTaskStub.returns(stepTaskStub);
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await expect(taskFunction({}, {} as SoloListrTaskWrapper<SimpleContext>)).to.be.rejectedWith(failure);
      expect(abortStub.calledOnceWithExactly(failure)).to.be.true;
    });

    it('does not abort the event bus when the leaf task succeeds', async (): Promise<void> => {
      stepTaskStub = {
        title: 'stub-step-task',
        task: sinon.stub().resolves('ok'),
      } as unknown as SoloListrTask<SimpleContext>;
      asListrTaskStub.returns(stepTaskStub);
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      );
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      const result: unknown = await taskFunction({}, {} as SoloListrTaskWrapper<SimpleContext>);
      expect(result).to.equal('ok');
      expect(abortStub.called).to.be.false;
    });
  });

  describe('asListrTask (one wait condition)', (): void => {
    it('returns a wrapper task with a task function instead of the step task directly', (): void => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      ).withWaitCondition(SoloEventType.MirrorNodeDeployed);
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(task).to.not.equal(stepTaskStub);
      expect(task).to.have.property('task').that.is.a('function');
    });

    it('wrapper task calls eventBus.waitFor with the correct event type', async (): Promise<void> => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      ).withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10));
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(waitForStub.calledOnce).to.be.true;
      expect(waitForStub.firstCall.args[0]).to.equal(SoloEventType.MirrorNodeDeployed);
    });

    it('waitFor predicate matches events for the configured deployment', async (): Promise<void> => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test deployed phase',
        stepStub,
      ).withWaitCondition(SoloEventType.MirrorNodeDeployed);
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      const predicate: (event: {deployment: string}) => boolean = waitForStub.firstCall.args[1];
      expect(predicate({deployment: 'test-deployment'})).to.be.true;
      expect(predicate({deployment: 'other-deployment'})).to.be.false;
    });

    it('step.asListrTask is called when phase.asListrTask is called and inner task is passed to newListr', async (): Promise<void> => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      ).withWaitCondition(SoloEventType.MirrorNodeDeployed);
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(asListrTaskStub.calledOnce).to.be.true;
      const getConfigArgument: () => SimpleConfig = asListrTaskStub.firstCall.args[0] as () => SimpleConfig;
      expect(getConfigArgument()).to.equal(config);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(asListrTaskStub.calledOnce).to.be.true;
      expect(newListrStub.calledOnce).to.be.true;
      expect((newListrStub.firstCall.args[0] as unknown[])[0]).to.equal(stepTaskStub);
    });

    it('propagates the skip function from the inner step task to the wrapper task', (): void => {
      const skipStub: SinonStub = sinon.stub().returns(true);
      stepTaskStub = {
        title: 'stub-step-task',
        skip: skipStub,
        task: sinon.stub(),
      } as unknown as SoloListrTask<SimpleContext>;
      asListrTaskStub.returns(stepTaskStub);
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      ).withWaitCondition(SoloEventType.MirrorNodeDeployed);
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(task).to.have.property('skip').that.is.a('function');
      expect((task.skip as () => boolean)()).to.be.true;
    });
  });

  describe('asListrTask (two wait conditions)', (): void => {
    it('calls eventBus.waitFor twice in order for both event types', async (): Promise<void> => {
      const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
        'test phase',
        stepStub,
      )
        .withWaitCondition(SoloEventType.MirrorNodeDeployed, Duration.ofMinutes(10))
        .withWaitCondition(SoloEventType.NodesStarted, Duration.ofMinutes(5));
      const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
      await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(waitForStub.calledTwice).to.be.true;
      expect(waitForStub.firstCall.args[0]).to.equal(SoloEventType.MirrorNodeDeployed);
      expect(waitForStub.secondCall.args[0]).to.equal(SoloEventType.NodesStarted);
    });
  });

  describe('Phase.composite', (): void => {
    let childStepStubA: OrchestratorStep<SimpleConfig, SimpleContext>;
    let childStepStubB: OrchestratorStep<SimpleConfig, SimpleContext>;
    let childPhaseA: OrchestratorPipelinePhase<SimpleConfig, SimpleContext>;
    let childPhaseB: OrchestratorPipelinePhase<SimpleConfig, SimpleContext>;

    beforeEach((): void => {
      childStepStubA = {asListrTask: sinon.stub().returns({title: 'child-a'})} as OrchestratorStep<
        SimpleConfig,
        SimpleContext
      >;
      childStepStubB = {asListrTask: sinon.stub().returns({title: 'child-b'})} as OrchestratorStep<
        SimpleConfig,
        SimpleContext
      >;
      childPhaseA = new OrchestratorPipelinePhase('child a', childStepStubA);
      childPhaseB = new OrchestratorPipelinePhase('child b', childStepStubB);
    });

    it('asListrTask returns a wrapper task with a task function, not the child step directly', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA, childPhaseB],
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(task).to.have.property('task').that.is.a('function');
    });

    it('sequential composite passes concurrent: false to newListr', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
        OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('concurrent composite passes concurrent: true to newListr', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
        OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT,
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(true);
    });

    it('exitOnError: false is passed through when specified', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
        OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT,
        false,
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {exitOnError: boolean}).exitOnError).to.equal(false);
    });

    it('calls each child phase asListrTask with the same config and eventBus', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA, childPhaseB],
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      const childTasks: SoloListrTask<SimpleContext>[] = newListrStub.firstCall
        .args[0] as SoloListrTask<SimpleContext>[];
      expect(childTasks).to.have.length(2);
      expect(childTasks[0]).to.have.property('title', 'child-a');
      expect(childTasks[1]).to.have.property('title', 'child-b');
    });

    it('defaults to sequential execution mode when not specified', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(false);
    });

    it('rendererOptions are passed to newListr when provided', (): void => {
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
        OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
        true,
        {collapseSubtasks: false},
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect((newListrStub.firstCall.args[1] as {rendererOptions: unknown}).rendererOptions).to.deep.equal({
        collapseSubtasks: false,
      });
    });

    it('dynamic executionMode function determines concurrent flag at task execution time', (): void => {
      const executionModeStub: SinonStub = sinon.stub().returns(OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT);
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
        executionModeStub,
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      const newListrStub: SinonStub = sinon.stub().returns([]);
      const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
        task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
      taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
      expect(executionModeStub.calledOnce).to.be.true;
      const getConfigArgument: () => SimpleConfig = executionModeStub.firstCall.args[0] as () => SimpleConfig;
      expect(getConfigArgument()).to.equal(config);
      expect((newListrStub.firstCall.args[1] as {concurrent: boolean}).concurrent).to.equal(true);
    });

    it('skip function on composite is evaluated with getConfig at task execution time', (): void => {
      const skipStub: SinonStub = sinon.stub().returns(true);
      const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
        'parent',
        [childPhaseA],
        OrchestratorPipelinePhase.EXECUTION_MODE.SEQUENTIAL,
        true,
        undefined,
        skipStub,
      );
      const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
      expect(task).to.have.property('skip').that.is.a('function');
      const skipResult: boolean = (task.skip as () => boolean)();
      expect(skipStub.calledOnce).to.be.true;
      const getConfigArgument: () => SimpleConfig = skipStub.firstCall.args[0] as () => SimpleConfig;
      expect(getConfigArgument()).to.equal(config);
      expect(skipResult).to.be.true;
    });
  });

  describe('asListrTask — SOLO_FAIL_AFTER_STEP injection', (): void => {
    afterEach((): void => {
      delete process.env.SOLO_FAIL_AFTER_STEP;
    });

    describe('simple path (no wait conditions)', (): void => {
      it('returns step task directly when SOLO_FAIL_AFTER_STEP does not match phase title', (): void => {
        process.env.SOLO_FAIL_AFTER_STEP = 'other phase';
        const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
          'test phase',
          stepStub,
        );
        const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
        expect(task).to.equal(stepTaskStub);
      });

      it('wraps step task with newListr when SOLO_FAIL_AFTER_STEP matches phase title', (): void => {
        process.env.SOLO_FAIL_AFTER_STEP = 'test phase';
        const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
          'test phase',
          stepStub,
        );
        const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
        expect(task).to.not.equal(stepTaskStub);
        expect(task).to.have.property('task').that.is.a('function');
        const newListrStub: SinonStub = sinon.stub().returns([]);
        const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
          task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
        taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
        expect(newListrStub.calledOnce).to.be.true;
        const subTasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
        expect(subTasks).to.have.length(2);
        expect(subTasks[0]).to.equal(stepTaskStub);
      });

      it('failure check task rejects with InjectedFailureSoloError and aborts the event bus when executed', async (): Promise<void> => {
        process.env.SOLO_FAIL_AFTER_STEP = 'test phase';
        const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
          'test phase',
          stepStub,
        );
        const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
        const newListrStub: SinonStub = sinon.stub().returns([]);
        const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
          task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
        taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
        const subTasks: SoloListrTask<SimpleContext>[] = newListrStub.firstCall
          .args[0] as SoloListrTask<SimpleContext>[];
        const failureTask: SoloListrTask<SimpleContext> = subTasks[1];
        const failureTaskFunction: (
          context: SimpleContext,
          wrapper: SoloListrTaskWrapper<SimpleContext>,
        ) => Promise<unknown> = failureTask.task as (
          context: SimpleContext,
          wrapper: SoloListrTaskWrapper<SimpleContext>,
        ) => Promise<unknown>;
        await expect(failureTaskFunction({}, {} as SoloListrTaskWrapper<SimpleContext>)).to.be.rejectedWith(
          InjectedFailureSoloError,
          "[TEST] Injected failure after step 'test phase'",
        );
        expect(abortStub.calledOnce).to.be.true;
        expect(abortStub.firstCall.args[0]).to.be.instanceOf(InjectedFailureSoloError);
      });
    });

    describe('wait condition path', (): void => {
      it('adds failure check as second newListr item when SOLO_FAIL_AFTER_STEP matches', async (): Promise<void> => {
        process.env.SOLO_FAIL_AFTER_STEP = 'test phase';
        const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
          'test phase',
          stepStub,
        ).withWaitCondition(SoloEventType.MirrorNodeDeployed);
        const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
        const newListrStub: SinonStub = sinon.stub().returns([]);
        const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
          task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
        await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
        const subTasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
        expect(subTasks).to.have.length(2);
        expect(subTasks[0]).to.equal(stepTaskStub);
      });

      it('does not add failure check when SOLO_FAIL_AFTER_STEP does not match', async (): Promise<void> => {
        process.env.SOLO_FAIL_AFTER_STEP = 'other phase';
        const phase: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = new OrchestratorPipelinePhase(
          'test phase',
          stepStub,
        ).withWaitCondition(SoloEventType.MirrorNodeDeployed);
        const task: SoloListrTask<SimpleContext> = phase.asListrTask((): SimpleConfig => config, eventBusStub);
        const newListrStub: SinonStub = sinon.stub().returns([]);
        const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown> =
          task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => Promise<unknown>;
        await taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
        const subTasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
        expect(subTasks).to.have.length(1);
        expect(subTasks[0]).to.equal(stepTaskStub);
      });
    });

    describe('composite path', (): void => {
      it('adds failure check as final sub-phase when SOLO_FAIL_AFTER_STEP matches composite title', (): void => {
        process.env.SOLO_FAIL_AFTER_STEP = 'parent';
        const childStepStubA: OrchestratorStep<SimpleConfig, SimpleContext> = {
          asListrTask: sinon.stub().returns({title: 'child-a'}),
        } as OrchestratorStep<SimpleConfig, SimpleContext>;
        const childStepStubB: OrchestratorStep<SimpleConfig, SimpleContext> = {
          asListrTask: sinon.stub().returns({title: 'child-b'}),
        } as OrchestratorStep<SimpleConfig, SimpleContext>;
        const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
          'parent',
          [
            new OrchestratorPipelinePhase('child a', childStepStubA),
            new OrchestratorPipelinePhase('child b', childStepStubB),
          ],
        );
        const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
        const newListrStub: SinonStub = sinon.stub().returns([]);
        const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
          task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
        taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
        const subTasks: SoloListrTask<SimpleContext>[] = newListrStub.firstCall
          .args[0] as SoloListrTask<SimpleContext>[];
        expect(subTasks).to.have.length(3);
        expect(subTasks[0]).to.have.property('title', 'child-a');
        expect(subTasks[1]).to.have.property('title', 'child-b');
        expect(subTasks[2]).to.have.property('title', "[test] fail after 'parent'");
        expect((): void => {
          (subTasks[2].task as () => void)();
        }).to.throw(InjectedFailureSoloError, "[TEST] Injected failure after step 'parent'");
      });

      it('does not add failure check when SOLO_FAIL_AFTER_STEP does not match composite title', (): void => {
        process.env.SOLO_FAIL_AFTER_STEP = 'other';
        const childStepStubA: OrchestratorStep<SimpleConfig, SimpleContext> = {
          asListrTask: sinon.stub().returns({title: 'child-a'}),
        } as OrchestratorStep<SimpleConfig, SimpleContext>;
        const composite: OrchestratorPipelinePhase<SimpleConfig, SimpleContext> = OrchestratorPipelinePhase.composite(
          'parent',
          [new OrchestratorPipelinePhase('child a', childStepStubA)],
        );
        const task: SoloListrTask<SimpleContext> = composite.asListrTask((): SimpleConfig => config, eventBusStub);
        const newListrStub: SinonStub = sinon.stub().returns([]);
        const taskFunction: (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown =
          task.task as (context: SimpleContext, wrapper: SoloListrTaskWrapper<SimpleContext>) => unknown;
        taskFunction({}, {newListr: newListrStub} as unknown as SoloListrTaskWrapper<SimpleContext>);
        const subTasks: unknown[] = newListrStub.firstCall.args[0] as unknown[];
        expect(subTasks).to.have.length(1);
      });
    });
  });
});
