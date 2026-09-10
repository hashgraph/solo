// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonFakeTimers} from 'sinon';
import {SoloListrRenderer} from '../../../../src/core/task-list/solo-listr-renderer.js';

/** The subset of the renderer's task shape that the timer logic reads. */
type TimerTask = {
  id: string;
  message: {duration?: number};
  hasFinalized(): boolean;
  isPending(): boolean;
  isCompleted(): boolean;
};

/** The state a fake task reports, mirroring the listr2 predicates the renderer calls. */
type TaskState = {
  id?: string;
  /** listr2: completed, failed, skipped, rolled back or cancelled. */
  finalized?: boolean;
  /** listr2 `isPending()`: started, prompting, or resetting (retry/rollback). */
  pending?: boolean;
  completed?: boolean;
  duration?: number;
};

/** Typed view over the private members the timer logic owns — see solo-pino-logger.test.ts for precedent. */
type RendererInternals = {
  timer(task: TimerTask): string;
  startedAt: Map<string, number>;
};

function internalsOf(renderer: SoloListrRenderer): RendererInternals {
  return renderer as unknown as RendererInternals;
}

function createTask(state: TaskState): TimerTask {
  return {
    id: state.id ?? 'task-1',
    message: {duration: state.duration},
    hasFinalized: (): boolean => state.finalized === true,
    isPending: (): boolean => state.pending === true,
    isCompleted: (): boolean => state.completed === true,
  };
}

describe('SoloListrRenderer timer', (): void => {
  let clock: SinonFakeTimers;
  let renderer: SoloListrRenderer;
  let internals: RendererInternals;

  beforeEach((): void => {
    clock = sinon.useFakeTimers();
    renderer = new SoloListrRenderer([]);
    internals = internalsOf(renderer);
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('while a task is running', (): void => {
    it('shows nothing before the task has been running long enough to be worth reporting', (): void => {
      const task: TimerTask = createTask({pending: true});

      expect(internals.timer(task)).to.equal('');
      clock.tick(4999);
      expect(internals.timer(task), 'a task under the display threshold must stay clean').to.equal('');
    });

    it('shows the elapsed time once the task has been running past the threshold', (): void => {
      const task: TimerTask = createTask({pending: true});

      internals.timer(task);
      clock.tick(6000);

      expect(internals.timer(task)).to.contain('[6s]');
    });

    it('advances the elapsed time as the task keeps running', (): void => {
      const task: TimerTask = createTask({pending: true});

      internals.timer(task);
      clock.tick(6000);
      expect(internals.timer(task)).to.contain('[6s]');

      clock.tick(144_000);
      expect(internals.timer(task), 'the counter must keep climbing so a long wait reads as alive').to.contain(
        '[2m30s]',
      );
    });

    it('shows nothing for a task that has not started yet, and does not start timing it', (): void => {
      const task: TimerTask = createTask({pending: false});

      expect(internals.timer(task)).to.equal('');
      expect(internals.startedAt.has('task-1'), 'an unstarted task must not be timed').to.be.false;
    });

    it('keeps timing from the first start across a retry rather than restarting the count', (): void => {
      // listr2 stamps its own start time before the retry loop and reports the total across attempts, and a
      // retrying task reports neither started nor finalized — so the count must survive that gap.
      const state: TaskState = {pending: true};
      const task: TimerTask = createTask(state);

      internals.timer(task);
      clock.tick(60_000);
      state.pending = false;
      clock.tick(30_000);
      state.pending = true;

      expect(internals.timer(task), 'a retry must not reset the elapsed time').to.contain('[1m30s]');
    });

    it('times each task independently', (): void => {
      const first: TimerTask = createTask({id: 'first', pending: true});
      internals.timer(first);

      clock.tick(60_000);
      const second: TimerTask = createTask({id: 'second', pending: true});
      internals.timer(second);

      clock.tick(6000);
      expect(internals.timer(first)).to.contain('[1m6s]');
      expect(internals.timer(second)).to.contain('[6s]');
    });
  });

  describe('once a task has finished', (): void => {
    it('shows the duration listr2 measured instead of the live counter', (): void => {
      const state: TaskState = {pending: true};
      const task: TimerTask = createTask(state);

      internals.timer(task);
      clock.tick(200_000);

      state.pending = false;
      state.finalized = true;
      state.completed = true;
      state.duration = 1000;
      task.message.duration = 1000;

      const rendered: string = internals.timer(task);
      expect(rendered).to.contain('[1s]');
      expect(rendered, 'a finished task must not report the live counter').to.not.contain('3m20s');
    });

    it('stops timing a finished task so in-flight tasks are all that is tracked', (): void => {
      const state: TaskState = {pending: true};
      const task: TimerTask = createTask(state);

      internals.timer(task);
      expect(internals.startedAt.has('task-1')).to.be.true;

      state.pending = false;
      state.finalized = true;
      state.completed = true;
      internals.timer(task);

      expect(internals.startedAt.has('task-1'), 'a finished task must not be tracked any more').to.be.false;
    });

    it('shows nothing for a task that failed or was skipped', (): void => {
      const failed: TimerTask = createTask({id: 'failed', finalized: true, duration: 60_000});
      const skipped: TimerTask = createTask({id: 'skipped', finalized: true});

      expect(internals.timer(failed)).to.equal('');
      expect(internals.timer(skipped)).to.equal('');
    });

    it('shows nothing for a task that completed too fast to be worth reporting', (): void => {
      const task: TimerTask = createTask({finalized: true, completed: true, duration: 100});

      expect(internals.timer(task)).to.equal('');
    });
  });
});
