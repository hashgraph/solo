// SPDX-License-Identifier: Apache-2.0

import {
  cleanseAnsi,
  color,
  figures,
  ListrEventType,
  ListrLogger,
  ListrTaskEventType,
  ListrTaskState,
  parseTimer,
  Spinner,
} from 'listr2';

/** Durations at or below this (ms) are not shown, matching the default renderer's timer condition. */
const TIMER_MINIMUM_MILLISECONDS: number = 100;
/** Durations above this (ms) render the timer in red instead of green, matching the default renderer. */
const TIMER_RED_THRESHOLD_MILLISECONDS: number = 30_000;
/**
 * A still-running task only shows its elapsed time once it has been running this long (ms), so tasks that
 * finish quickly stay clean instead of flickering a counter on and off.
 */
const RUNNING_TIMER_MINIMUM_MILLISECONDS: number = 5000;
/** How many of a parent's still-pending children are shown live before the rest are collapsed. */
const CHILD_WINDOW_SIZE: number = 5;

/** The in-place updater returned by log-update; kept local so log-update need not be a direct import. */
interface LiveUpdater {
  (text: string): void;
  clear(): void;
  done(): void;
}

/** The subset of the listr2 Task API this renderer reads. */
interface RendererTask {
  id: string;
  title?: string;
  output?: string;
  subtasks?: RendererTask[];
  /** Per-task renderer overrides; `showSubtasks: false` collapses this task to a single line. */
  rendererOptions?: {showSubtasks?: boolean};
  message: {duration?: number; error?: string; skip?: string};
  hasTitle(): boolean;
  hasSubtasks(): boolean;
  hasFinalized(): boolean;
  hasReset(): boolean;
  isStarted(): boolean;
  isPrompt(): boolean;
  on(event: ListrTaskEventType, callback: (data: unknown) => void): void;
  off(event: ListrTaskEventType): void;
  isCompleted(): boolean;
  hasFailed(): boolean;
  isSkipped(): boolean;
  isPending(): boolean;
}

/** Minimal shape of the event manager listr2 hands the renderer. */
interface RendererEvents {
  on(event: ListrEventType, callback: () => void): void;
}

/** A rendered live-region line plus the metadata needed to clamp the frame while keeping titles. */
interface LiveLine {
  text: string;
  depth: number;
  /** True when this line is a task title that has children (an ancestor worth keeping for context). */
  parent: boolean;
}

const INDENT: string = '  ';

/**
 * Solo's Listr renderer. It keeps the in-place tree (spinner + indentation, default-renderer look) but
 * cannot corrupt when the task tree outgrows the terminal, because it never keeps the whole tree in the
 * redrawn region.
 *
 * It commits a task subtree to permanent scrollback (in spawn order) once the whole subtree finishes, so
 * completed work becomes a clean, correctly-finalized static log. For every still-running task with
 * children, the live viewport shows at most {@link CHILD_WINDOW_SIZE} of its pending children (the most
 * recent), collapses finished-but-not-yet-committed children and any further pending ones into a single
 * `N completed, M pending...` summary line, so each parent contributes only a small window. If even that
 * exceeds the terminal height, the frame is clamped to a trailing window plus the ancestor title spine
 * that gives it context, so a parent task's title is never clipped off the top.
 *
 * Tasks that have been running for a while carry a live elapsed time, so a phase that polls silently for
 * many minutes still visibly progresses instead of looking hung.
 */
export class SoloListrRenderer {
  public static nonTTY: boolean = false;
  public static rendererOptions: object = {};
  public static rendererTaskOptions: object = {};

  private readonly logger: ListrLogger;
  private readonly spinner: Spinner = new Spinner();
  private updater?: LiveUpdater;

  /** Ids of task subtrees already written to permanent scrollback. */
  private readonly committed: Set<string> = new Set();

  /**
   * When each still-running task was first seen running, keyed by task id, so a live elapsed time can be
   * shown for work that listr2 has not finished timing yet. Entries are dropped once a task finalizes, so
   * this stays bounded to the tasks currently in flight.
   */
  private readonly startedAt: Map<string, number> = new Map();

  private promptText?: string;
  private activePromptId?: string;

  public constructor(
    private readonly tasks: RendererTask[],
    private readonly options: {lazy?: boolean; showSubtasks?: boolean} = {},
    private readonly events?: RendererEvents,
  ) {
    this.logger = new ListrLogger({useIcons: true});
  }

  public async render(): Promise<void> {
    // log-update ships as a transitive dependency of listr2, which loads it the same way.
    // eslint-disable-next-line n/no-extraneous-import
    const {createLogUpdate} = await import('log-update');
    this.updater = createLogUpdate(this.logger.process.stdout) as unknown as LiveUpdater;
    this.logger.process.hijack();

    if (!this.options?.lazy) {
      this.spinner.start((): void => {
        this.update();
      });
    }
    this.events?.on(ListrEventType.SHOULD_REFRESH_RENDER, (): void => {
      this.update();
    });
  }

  public end(): void {
    this.spinner.stop();

    // Everything is finalized by now: flush all remaining subtrees, clear the live region, then leave
    // the full (unwindowed) static log behind.
    const flushed: string[] = [];
    this.flush(this.tasks, 0, flushed);

    this.updater?.clear();
    if (flushed.length > 0) {
      this.logger.process.toStdout(flushed.join('\n'));
    }

    const remaining: string[] = [];
    this.renderFull(this.tasks, 0, remaining);
    if (remaining.length > 0) {
      this.logger.process.toStdout(remaining.join('\n'));
    }

    this.updater?.done();
    this.logger.process.release();
  }

  private update(): void {
    if (!this.updater) {
      return;
    }

    this.syncPrompt(this.tasks);

    const flushed: string[] = [];
    this.flush(this.tasks, 0, flushed);
    if (flushed.length > 0) {
      this.updater.clear();
      this.logger.process.toStdout(flushed.join('\n'));
    }

    const live: LiveLine[] = [];
    this.renderLive(this.tasks, 0, live);

    const promptLineCount: number = this.promptText ? this.promptText.split('\n').length : 0;
    const budget: number = Math.max(1, (process.stdout.rows ?? 24) - 1 - promptLineCount);
    const lines: string[] = this.clampLive(live, budget);
    if (this.promptText) {
      lines.push(this.promptText);
    }
    this.updater(lines.join('\n'));
  }

  private syncPrompt(tasks: RendererTask[]): void {
    for (const task of tasks) {
      if (task.isPrompt() && this.activePromptId !== task.id) {
        this.activePromptId = task.id;
        task.on(ListrTaskEventType.PROMPT, (prompt: unknown): void => {
          const cleansed: string = cleanseAnsi(String(prompt ?? ''));
          if (cleansed) {
            this.promptText = cleansed;
          }
        });
        task.on(ListrTaskEventType.STATE, (state: unknown): void => {
          if (state === ListrTaskState.PROMPT_COMPLETED || task.hasFinalized() || task.hasReset()) {
            this.promptText = undefined;
            this.activePromptId = undefined;
            task.off(ListrTaskEventType.PROMPT);
          }
        });
      }
      if (task.hasSubtasks()) {
        this.syncPrompt(task.subtasks ?? []);
      }
    }
  }

  // --- flushing (permanent, order-preserving) ---

  /** Appends scrollback lines for the leading run of fully-finalized subtrees, in spawn order. */
  private flush(tasks: RendererTask[], depth: number, out: string[]): void {
    for (const task of tasks) {
      if (this.committed.has(task.id)) {
        continue;
      }
      if (!this.isSubtreeFinalized(task)) {
        return;
      }
      this.commit(task, depth, out);
    }
  }

  /** Write a fully-finalized subtree to scrollback (parent first, full detail) and mark it committed. */
  private commit(task: RendererTask, depth: number, out: string[]): void {
    const childDepth: number = task.hasTitle() ? depth + 1 : depth;
    if (task.hasTitle()) {
      out.push(this.line(task, depth));
    }
    this.committed.add(task.id);
    // A collapsed task (showSubtasks: false) contributes only its own line; its subtree is marked
    // committed so nothing dangles but is never written out.
    if (!this.showsSubtasks(task)) {
      this.markCommitted(task.subtasks ?? []);
      return;
    }
    for (const subtask of task.subtasks ?? []) {
      this.commit(subtask, childDepth, out);
    }
  }

  /** Recursively marks a subtree committed without emitting any lines (used for collapsed tasks). */
  private markCommitted(tasks: RendererTask[]): void {
    for (const task of tasks) {
      this.committed.add(task.id);
      this.markCommitted(task.subtasks ?? []);
    }
  }

  // --- live region (in-place, windowed per parent) ---

  private renderLive(tasks: RendererTask[], depth: number, out: LiveLine[]): void {
    for (const task of tasks) {
      if (this.committed.has(task.id)) {
        continue;
      }
      this.renderTaskWindowed(task, depth, out);
    }
  }

  /** Renders one task's line plus a bounded window of its children. */
  private renderTaskWindowed(task: RendererTask, depth: number, out: LiveLine[]): void {
    const childDepth: number = task.hasTitle() ? depth + 1 : depth;
    if (task.hasTitle()) {
      out.push({text: this.line(task, depth), depth, parent: task.hasSubtasks() && this.showsSubtasks(task)});
      if (task.output) {
        out.push({text: INDENT.repeat(childDepth) + color.dim(task.output.trim()), depth: childDepth, parent: false});
      }
    }
    if (task.hasSubtasks() && this.showsSubtasks(task)) {
      this.renderChildrenWindow(task, childDepth, out);
    }
  }

  /**
   * Renders at most {@link CHILD_WINDOW_SIZE} of a parent's still-pending children (the most recent),
   * collapsing already-finished children into a count and noting any further pending ones. Finished
   * children stay collapsed here; their full detail reaches scrollback when the whole parent commits.
   */
  private renderChildrenWindow(parent: RendererTask, depth: number, out: LiveLine[]): void {
    const children: RendererTask[] = (parent.subtasks ?? []).filter((child): boolean => !this.committed.has(child.id));
    const finishedCount: number = children.filter((child): boolean => this.isSubtreeFinalized(child)).length;
    const pending: RendererTask[] = children.filter((child): boolean => !this.isSubtreeFinalized(child));

    // A single summary line for what is not fully shown, e.g. "> 4 completed, 8 pending...".
    if (finishedCount > 0 || pending.length > CHILD_WINDOW_SIZE) {
      const parts: string[] = [];
      if (finishedCount > 0) {
        parts.push(`${finishedCount} completed`);
      }
      if (pending.length > 0) {
        parts.push(`${pending.length} pending`);
      }
      out.push({text: `${INDENT.repeat(depth)}${color.dim(`❯ ${parts.join(', ')}...`)}`, depth, parent: false});
    }

    const shown: RendererTask[] =
      pending.length > CHILD_WINDOW_SIZE ? pending.slice(pending.length - CHILD_WINDOW_SIZE) : pending;
    for (const child of shown) {
      this.renderTaskWindowed(child, depth, out);
    }
  }

  /**
   * Clamps the live frame to `budget` lines. When it overflows, keeps the trailing lines that fit plus
   * the ancestor title lines that give them context (and a `… N more lines above` marker), so a parent
   * task's title is never dropped even when its window is off the top of the viewport.
   */
  private clampLive(entries: LiveLine[], budget: number): string[] {
    if (entries.length <= budget) {
      return entries.map((entry): string => entry.text);
    }

    // Size the tail so there is room for the marker line plus the ancestor titles above it.
    let tailSize: number = budget;
    for (let pass: number = 0; pass < 8; pass++) {
      const ancestorCount: number = this.ancestorHeaders(entries, entries.length - tailSize).length;
      const nextTailSize: number = Math.max(1, budget - ancestorCount - 1);
      if (nextTailSize === tailSize) {
        break;
      }
      tailSize = nextTailSize;
    }

    const startIndex: number = entries.length - tailSize;
    const ancestors: LiveLine[] = this.ancestorHeaders(entries, startIndex);
    const hiddenCount: number = startIndex - ancestors.length;
    const marker: string = color.dim(`… ${hiddenCount} more line${hiddenCount === 1 ? '' : 's'} above`);
    const lines: string[] = [
      marker,
      ...ancestors.map((entry): string => entry.text),
      ...entries.slice(startIndex).map((entry): string => entry.text),
    ];
    return lines.slice(0, Math.max(budget, ancestors.length + 1));
  }

  /** The nearest parent-title line at each depth above `startIndex`, i.e. the ancestor spine. */
  private ancestorHeaders(entries: LiveLine[], startIndex: number): LiveLine[] {
    if (startIndex <= 0 || startIndex >= entries.length) {
      return [];
    }
    const headers: LiveLine[] = [];
    let neededDepth: number = entries[startIndex].depth - 1;
    for (let index: number = startIndex - 1; index >= 0 && neededDepth >= 0; index--) {
      if (entries[index].parent && entries[index].depth === neededDepth) {
        headers.unshift(entries[index]);
        neededDepth--;
      }
    }
    return headers;
  }

  /** Full, unwindowed render of the not-yet-committed tasks — used only for the final static output. */
  private renderFull(tasks: RendererTask[], depth: number, out: string[]): void {
    for (const task of tasks) {
      if (this.committed.has(task.id)) {
        continue;
      }
      const childDepth: number = task.hasTitle() ? depth + 1 : depth;
      if (task.hasTitle()) {
        out.push(this.line(task, depth));
        if (task.output) {
          out.push(INDENT.repeat(childDepth) + color.dim(task.output.trim()));
        }
      }
      if (task.hasSubtasks() && this.showsSubtasks(task)) {
        this.renderFull(task.subtasks ?? [], childDepth, out);
      }
    }
  }

  // --- helpers ---

  /**
   * Whether this task's subtasks should be rendered. A task (or the whole list) marked
   * `showSubtasks: false` collapses to a single line — mirroring the default renderer, and honouring
   * the collapsed lists solo builds via `SpinnerListrOptions`. Per-task overrides win over the
   * list-level default.
   */
  private showsSubtasks(task: RendererTask): boolean {
    const taskOption: boolean | undefined = task.rendererOptions?.showSubtasks;
    if (taskOption !== undefined) {
      return taskOption;
    }
    return this.options?.showSubtasks !== false;
  }

  private isSubtreeFinalized(task: RendererTask): boolean {
    return task.hasFinalized() && (task.subtasks ?? []).every((subtask): boolean => this.isSubtreeFinalized(subtask));
  }

  private line(task: RendererTask, depth: number): string {
    return `${INDENT.repeat(depth)}${this.icon(task)} ${task.title ?? ''}${this.timer(task)}`;
  }

  private icon(task: RendererTask): string {
    if (task.isCompleted()) {
      return color.green(figures.tick);
    }
    if (task.hasFailed()) {
      return color.red(figures.cross);
    }
    if (task.isSkipped()) {
      return color.yellow(figures.arrowDown);
    }
    // Running (or prompting) tasks — parents included — animate with the spinner; tasks still waiting to
    // start get a dim, static marker to set them apart.
    if (task.isStarted() || task.isPrompt()) {
      return color.yellow(this.spinner.fetch());
    }
    return color.dim(figures.pointerSmall);
  }

  /**
   * The `[duration]` suffix for a task line: a live elapsed time while the task is still running, and the
   * final duration listr2 measured once it has finished. Long waits (a node becoming ACTIVE, a database
   * schema being created) can otherwise sit unchanged for many minutes, leaving no way to tell a slow task
   * from a hung one.
   */
  private timer(task: RendererTask): string {
    if (task.hasFinalized()) {
      // Finished tasks are timed by listr2 itself, so the running stamp is no longer needed. Dropping it
      // here also keeps the map bounded, and guarantees permanent scrollback shows the final duration
      // rather than whatever the counter last read.
      this.startedAt.delete(task.id);
      return this.completedTimer(task);
    }
    return this.runningTimer(task);
  }

  /** The elapsed time of a task that is still running, dimmed so it reads as information, not alarm. */
  private runningTimer(task: RendererTask): string {
    let startedAt: number | undefined = this.startedAt.get(task.id);

    if (startedAt === undefined) {
      // Tasks that have not started yet have nothing to count.
      if (!task.isPending()) {
        return '';
      }
      startedAt = Date.now();
      this.startedAt.set(task.id, startedAt);
    }

    const elapsed: number = Date.now() - startedAt;
    if (elapsed < RUNNING_TIMER_MINIMUM_MILLISECONDS) {
      return '';
    }
    return color.dim(` [${parseTimer(elapsed)}]`);
  }

  /** The duration listr2 measured for a completed task; nothing for failed, skipped or very fast tasks. */
  private completedTimer(task: RendererTask): string {
    const duration: number | undefined = task.message?.duration;
    if (duration === undefined || !task.isCompleted() || duration <= TIMER_MINIMUM_MILLISECONDS) {
      return '';
    }
    const colorize: (text: string) => string = duration > TIMER_RED_THRESHOLD_MILLISECONDS ? color.red : color.green;
    return colorize(` [${parseTimer(duration)}]`);
  }
}
