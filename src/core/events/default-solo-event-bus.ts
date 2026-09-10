// SPDX-License-Identifier: Apache-2.0

import {EventEmitter as NodeEventEmitter} from 'node:events';
import {inject, injectable} from 'tsyringe-neo';
import {SoloEventType} from './event-types/solo-event.js';
import {AnySoloEvent} from './event-types/solo-event-type.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type SoloEventBus} from './solo-event-bus.js';
import {Duration} from '../time/duration.js';
import {SoloErrors} from '../errors/solo-errors.js';

@injectable()
export class DefaultSoloEventBus implements SoloEventBus {
  private readonly emitter: NodeEventEmitter = new NodeEventEmitter();
  // Keep an in-memory log of all emitted events, grouped by event type.
  private readonly history: Map<SoloEventType, AnySoloEvent[]> = new Map();
  // Set once a phase fails; the root cause is preserved (first-in wins) and reported to the caller.
  private aborted: boolean = false;
  private abortReasonError: Error | undefined = undefined;
  // Cancel callbacks for in-flight waitFor promises, invoked on abort to fail them fast.
  private readonly pendingWaiters: Set<(reason: Error) => void> = new Set();

  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public emit(event: AnySoloEvent): void {
    // Record event in history so callers can query or have waitFor resolve
    // even if the event was emitted before they started listening.
    let list: AnySoloEvent[] | undefined = this.history.get(event.type);
    if (!list) {
      list = [];
      this.history.set(event.type, list);
    }
    list.push(event);

    // Log the event for debugging/inspection. Use debug level to avoid
    // cluttering normal output, but this can be changed if needed.
    this.logger.debug(`DefaultSoloEventBus.emit: type=${String(event.type)}`, event);

    this.emitter.emit(event.type, event);
  }

  public on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void {
    this.emitter.on(type, handler as (...arguments_: unknown[]) => void);
  }

  public off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void {
    this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
  }

  public clearHistory(type?: SoloEventType): void {
    if (type === undefined) {
      this.history.clear();
    } else {
      this.history.delete(type);
    }
  }

  public abort(reason: Error): void {
    // First-in wins: keep the root cause and ignore later, cascading failures.
    if (this.aborted) {
      return;
    }
    this.aborted = true;
    this.abortReasonError = reason;
    this.logger.debug(`DefaultSoloEventBus.abort: reason=${reason.message}`);
    const waiters: Array<(reason: Error) => void> = [...this.pendingWaiters];
    this.pendingWaiters.clear();
    for (const cancel of waiters) {
      cancel(reason);
    }
  }

  public abortReason(): Error | undefined {
    return this.abortReasonError;
  }

  public reset(): void {
    this.aborted = false;
    this.abortReasonError = undefined;
    this.pendingWaiters.clear();
    this.history.clear();
  }

  public async waitFor<T extends AnySoloEvent>(
    type: SoloEventType,
    predicate?: (event: T) => boolean,
    timeout: Duration = Duration.ofSeconds(60),
  ): Promise<T> {
    return new Promise<T>((resolve: (value: T | PromiseLike<T>) => void, reject: (reason: unknown) => void): void => {
      // If a phase has already failed, fail fast instead of waiting until the timeout.
      if (this.aborted) {
        reject(new SoloErrors.internal.pipelineCancelled(this.abortReasonError as Error));
        return;
      }

      // Ensure we only settle once, whether via handler, history check, timeout, or abort.
      let settled: boolean = false;

      const timer: NodeJS.Timeout = setTimeout((): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(
          new SoloErrors.system.timeout(
            `waitFor timed out after ${timeout.toMillis()}ms waiting for event type: ${String(type)}`,
          ),
        );
      }, timeout.toMillis());

      const handler: (event: T) => void = (event: T): void => {
        let matches: boolean;
        try {
          matches = !predicate || predicate(event);
        } catch (error) {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(
            new SoloErrors.system.containerOperationFailed(
              `waitFor handler predicate for event type: ${String(type)}`,
              error,
            ),
          );
          return;
        }
        if (!matches || settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(event);
      };

      // Invoked by abort() so a sibling phase's failure fails this waiter fast.
      const cancel: (reason: Error) => void = (reason: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(new SoloErrors.internal.pipelineCancelled(reason));
      };

      const cleanup: () => void = (): void => {
        clearTimeout(timer);
        this.emitter.off(type, handler as (...arguments_: unknown[]) => void);
        this.pendingWaiters.delete(cancel);
      };

      // Register handler first to avoid missing events that arrive while we're checking the history.
      this.emitter.on(type, handler as (...arguments_: unknown[]) => void);
      this.pendingWaiters.add(cancel);

      // Then check the history for already-emitted events (newest first).
      const events: AnySoloEvent[] | undefined = this.history.get(type);
      if (events) {
        for (let index: number = events.length - 1; index >= 0 && !settled; index--) {
          const candidate: T = events[index] as T;
          let matches: boolean;
          try {
            matches = !predicate || predicate(candidate);
          } catch (error) {
            settled = true;
            cleanup();
            reject(
              new SoloErrors.system.containerOperationFailed(
                `waitFor history check predicate for event type: ${String(type)}`,
                error,
              ),
            );
            return;
          }
          if (matches) {
            settled = true;
            cleanup();
            resolve(candidate);
            return;
          }
        }
      }
    });
  }
}
