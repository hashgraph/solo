// SPDX-License-Identifier: Apache-2.0

import {type SoloListr, type SoloListrTask, type SoloListrTaskWrapper} from '../../../types/index.js';
import {type SoloEventType} from '../../../core/events/event-types/solo-event.js';
import {type AnySoloEvent} from '../../../core/events/event-types/solo-event-type.js';
import {type SoloEventBus} from '../../../core/events/solo-event-bus.js';
import {Duration} from '../../../core/time/duration.js';
import {type OrchestratorStep} from './orchestrator-step.js';
import {ExecutionMode} from './execution-mode.js';
import {SoloErrors} from '../../../core/errors/solo-errors.js';

type DeploymentEvent = AnySoloEvent & {deployment: string};

type WaitCondition = {
  eventType: SoloEventType;
  timeout: Duration;
};

export class OrchestratorPipelinePhase<TConfig extends {deployment: string}, TContext> {
  private readonly waitConditions: WaitCondition[] = [];

  public static EXECUTION_MODE: {SEQUENTIAL: ExecutionMode; CONCURRENT: ExecutionMode} = {
    SEQUENTIAL: ExecutionMode.SEQUENTIAL,
    CONCURRENT: ExecutionMode.CONCURRENT,
  };

  public constructor(
    private readonly title: string,
    private readonly step: OrchestratorStep<TConfig, TContext> | undefined,
    private readonly subPhases: ReadonlyArray<OrchestratorPipelinePhase<TConfig, TContext>> = [],
    private readonly executionMode:
      ExecutionMode | ((getConfig: () => TConfig) => ExecutionMode) = OrchestratorPipelinePhase.EXECUTION_MODE
      .SEQUENTIAL,
    private readonly exitOnError: boolean = true,
    private readonly rendererOptions?: object,
    private readonly skipFunction?: (getConfig: () => TConfig) => boolean,
    private readonly collapseChildren: boolean | ((getConfig: () => TConfig) => boolean) = false,
  ) {}

  public static composite<TConfig extends {deployment: string}, TContext>(
    title: string,
    subPhases: ReadonlyArray<OrchestratorPipelinePhase<TConfig, TContext>>,
    executionMode: ExecutionMode | ((getConfig: () => TConfig) => ExecutionMode) = OrchestratorPipelinePhase
      .EXECUTION_MODE.SEQUENTIAL,
    exitOnError: boolean = true,
    rendererOptions?: object,
    skipFunction?: (getConfig: () => TConfig) => boolean,
    collapseChildren: boolean | ((getConfig: () => TConfig) => boolean) = false,
  ): OrchestratorPipelinePhase<TConfig, TContext> {
    return new OrchestratorPipelinePhase<TConfig, TContext>(
      title,
      undefined,
      subPhases,
      executionMode,
      exitOnError,
      rendererOptions,
      skipFunction,
      collapseChildren,
    );
  }

  public withWaitCondition(eventType: SoloEventType, timeout: Duration = Duration.ofMinutes(5)): this {
    this.waitConditions.push({eventType, timeout});
    return this;
  }

  /**
   * Builds a skip callback that also emits one or more events when the skip condition is true.
   *
   * Use this for phases that other phases wait on via {@link withWaitCondition}: a skipped phase
   * still has to notify downstream waiters, otherwise their {@link SoloEventBus.waitFor} blocks until
   * it times out. This is the counterpart to {@link withWaitCondition} — one waits for events, the
   * other emits them when there is no work to do.
   *
   * Events are supplied as factories because a phase's payload (for example the deployment name) is
   * only known once the pipeline config is populated at run time, after the phases have been built.
   *
   * @param eventBus - the bus the events are emitted on
   * @param skipCallback - returns true when the phase should be skipped
   * @param eventsToEmit - event factories emitted, in order, when the phase is skipped
   * @returns a skip callback that emits the events and returns the skip decision
   */
  public static skipAndNotify(
    eventBus: SoloEventBus,
    skipCallback: () => boolean,
    eventsToEmit: Array<() => AnySoloEvent>,
  ): () => boolean {
    return (): boolean => {
      const shouldSkip: boolean = skipCallback();
      if (shouldSkip) {
        for (const createEvent of eventsToEmit) {
          eventBus.emit(createEvent());
        }
      }
      return shouldSkip;
    };
  }

  public asListrTask(getConfig: () => TConfig, eventBus: SoloEventBus): SoloListrTask<TContext> {
    const shouldInjectFailure: boolean =
      (process.env.SOLO_FAIL_AFTER_STEP ?? '').replaceAll("'", '').replaceAll('"', '') === this.title;

    if (this.subPhases.length > 0) {
      return {
        title: this.title,
        skip: this.skipFunction ? (): boolean => this.skipFunction!(getConfig) : false,
        task: (_: TContext, task: SoloListrTaskWrapper<TContext>): SoloListr<TContext> => {
          const isConcurrent: boolean =
            typeof this.executionMode === 'function'
              ? this.executionMode(getConfig) === OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT
              : this.executionMode === OrchestratorPipelinePhase.EXECUTION_MODE.CONCURRENT;
          const subTasks: SoloListrTask<TContext>[] = this.subPhases.map(
            (phase: OrchestratorPipelinePhase<TConfig, TContext>): SoloListrTask<TContext> =>
              phase.asListrTask(getConfig, eventBus),
          );
          if (shouldInjectFailure) {
            subTasks.push(this.buildFailureInjectionTask());
          }

          const shouldCollapseChildren: boolean =
            typeof this.collapseChildren === 'function' ? this.collapseChildren(getConfig) : this.collapseChildren;
          const collapsedRendererOptions: object = shouldCollapseChildren ? {showSubtasks: false} : {};
          const mergedRendererOptions: object = {...this.rendererOptions, ...collapsedRendererOptions};
          return task.newListr(subTasks, {
            concurrent: isConcurrent,
            exitOnError: this.exitOnError,
            ...(Object.keys(mergedRendererOptions).length > 0 ? {rendererOptions: mergedRendererOptions} : {}),
          });
        },
      };
    }

    if (this.waitConditions.length === 0) {
      const innerTask: SoloListrTask<TContext> = this.wrapWithAbort(
        (this.step as OrchestratorStep<TConfig, TContext>).asListrTask(getConfig),
        eventBus,
      );
      if (!shouldInjectFailure) {
        return innerTask;
      }
      const failureTask: SoloListrTask<TContext> = this.wrapWithAbort(this.buildFailureInjectionTask(), eventBus);
      return {
        ...innerTask,
        task: (_: TContext, taskWrapper: SoloListrTaskWrapper<TContext>): SoloListr<TContext> =>
          taskWrapper.newListr([innerTask, failureTask], {exitOnError: true}),
      };
    }

    const innerTask: SoloListrTask<TContext> = this.wrapWithAbort(
      (this.step as OrchestratorStep<TConfig, TContext>).asListrTask(getConfig),
      eventBus,
    );
    return {
      title: this.title,
      skip: innerTask.skip,
      task: async (_: TContext, taskWrapper: SoloListrTaskWrapper<TContext>): Promise<SoloListr<TContext>> => {
        for (const {eventType, timeout} of this.waitConditions) {
          await eventBus.waitFor<DeploymentEvent>(
            eventType,
            (event: DeploymentEvent): boolean => event.deployment === getConfig().deployment,
            timeout,
          );
        }
        const subTasks: SoloListrTask<TContext>[] = [innerTask];
        if (shouldInjectFailure) {
          subTasks.push(this.wrapWithAbort(this.buildFailureInjectionTask(), eventBus));
        }
        return taskWrapper.newListr(subTasks);
      },
    };
  }

  /**
   * Wraps a leaf task so that a failure in its body aborts the shared event bus before propagating.
   * Aborting fails-fast any sibling phase blocked in {@link SoloEventBus.waitFor} (so it does not
   * hang until its own timeout) and records the first-in error as the pipeline's root cause. The
   * error is then re-thrown unchanged so Listr2's {@code exitOnError} still stops the group.
   */
  private wrapWithAbort(task: SoloListrTask<TContext>, eventBus: SoloEventBus): SoloListrTask<TContext> {
    const originalTask: SoloListrTask<TContext>['task'] = task.task;
    task.task = async (context: TContext, taskWrapper: SoloListrTaskWrapper<TContext>): Promise<unknown> => {
      try {
        return await originalTask(context, taskWrapper);
      } catch (error) {
        eventBus.abort(error as Error);
        throw error;
      }
    };
    return task;
  }

  private buildFailureInjectionTask(): SoloListrTask<TContext> {
    const title: string = this.title;
    return {
      title: `[test] fail after '${title}'`,
      task: (): never => {
        throw new SoloErrors.internal.injectedFailure(title);
      },
    };
  }
}
