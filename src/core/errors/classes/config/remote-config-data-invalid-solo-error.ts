// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when the remote configuration stored in the `solo-remote-config` ConfigMap cannot be
 * turned into a configuration object: the `remote-config-data` value is empty, is not parseable as YAML, or
 * parses to something that is not a configuration object (a bare scalar, `null`, or a sequence). solo treats
 * that ConfigMap as the source of truth for a deployment and reads it before almost any other work, so an
 * unusable value blocks the whole command. The value is normally only written by solo itself, so this means it
 * was hand-edited, truncated by a partial or interrupted write, or otherwise corrupted in the cluster. The
 * offending value is captured on the error (`meta.capturedData`) so it can be inspected after the fact.
 */
export class RemoteConfigDataInvalidSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.Infrastructure;

  /** Upper bound on the captured value retained on the error, so a large ConfigMap cannot bloat the log record. */
  private static readonly CAPTURE_LIMIT: number = 8192;

  /** Upper bound on the single-line excerpt embedded in the message, so the rendered error box stays readable. */
  private static readonly EXCERPT_LIMIT: number = 240;

  public constructor(key: string, reason: string, capturedData: string, cause?: Error) {
    const data: string = capturedData ?? '';
    super(
      {
        message:
          `Remote configuration data in ConfigMap "solo-remote-config" under key "${key}" is unusable: ${reason}\n` +
          `Captured value (${data.length} bytes): ${RemoteConfigDataInvalidSoloError.excerpt(data)}`,
        code: ErrorCodeRegistry.REMOTE_CONFIG_DATA_INVALID,
        troubleshootingSteps:
          'Inspect the stored value: kubectl get configmap solo-remote-config -n <namespace> -o yaml\n' +
          'The full captured value is recorded in ~/.solo/logs/solo.log\n' +
          'Recover by deleting and recreating the cluster: solo one-shot single destroy, then solo one-shot single deploy\n' +
          'Collect a diagnostics bundle: solo deployment diagnostics debug\n' +
          `If this is reproducible or looks like a solo bug, open an issue or PR with the diagnostics bundle: ${SoloError.bugReportUrl}`,
      },
      cause,
      {key, capturedData: data.slice(0, RemoteConfigDataInvalidSoloError.CAPTURE_LIMIT)},
    );
  }

  /** Collapses the captured value to a single quoted line so it cannot break up the rendered error box. */
  private static excerpt(data: string): string {
    if (data.length === 0) {
      return '<empty>';
    }
    const singleLine: string = data.replaceAll(/\s+/g, ' ').trim();
    return singleLine.length > RemoteConfigDataInvalidSoloError.EXCERPT_LIMIT
      ? `${JSON.stringify(singleLine.slice(0, RemoteConfigDataInvalidSoloError.EXCERPT_LIMIT))} (truncated)`
      : JSON.stringify(singleLine);
  }
}
