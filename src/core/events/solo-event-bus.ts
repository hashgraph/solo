// SPDX-License-Identifier: Apache-2.0

import {type AnySoloEvent} from './event-types/solo-event-type.js';
import {type SoloEventType} from './event-types/solo-event.js';
import {type Duration} from '../time/duration.js';

export interface SoloEventBus {
  emit(event: AnySoloEvent): void;
  on<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  off<T extends AnySoloEvent>(type: SoloEventType, handler: (event: T) => void): void;
  waitFor<T extends AnySoloEvent>(
    type: SoloEventType,
    predicate?: (event: T) => boolean,
    timeout?: Duration,
  ): Promise<T>;
  /** Clears all recorded event history. Optionally scoped to a single event type. */
  clearHistory(type?: SoloEventType): void;
  /**
   * Aborts the bus: records {@link reason} as the abort reason (first call wins; later calls are
   * ignored so the root cause is never overwritten) and immediately rejects every pending — and any
   * subsequent — {@link waitFor} so waiters fail fast instead of blocking until their timeout.
   */
  abort(reason: Error): void;
  /** Returns the first-in abort reason recorded by {@link abort}, or undefined if not aborted. */
  abortReason(): Error | undefined;
  /** Clears the aborted flag, the abort reason, and all recorded event history. */
  reset(): void;
}
