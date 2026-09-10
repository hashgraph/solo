// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../solo-error.js';
import {ErrorOwnership} from '../../error-ownership.js';
import {ErrorCodeRegistry} from '../../error-code-registry.js';

/**
 * @description Thrown when a Helm values file cannot be parsed; the underlying failure is wrapped in `cause`.
 * solo reads values files supplied via `--values-file` and values files it caches under the solo home directory before
 * handing them to Helm, so this means the file content is neither valid JSON nor valid YAML — for example a stale or
 * partially written cached values file left behind by an interrupted run.
 */
export class ValuesFileParseFailedSoloError extends SoloError {
  protected override readonly retryable: boolean = false;
  protected override readonly ownership: ErrorOwnership = ErrorOwnership.User;

  public constructor(valuesFilePath: string, cause: Error) {
    super(
      {
        message: `Failed to parse values file ${valuesFilePath}: ${cause.message}`,
        code: ErrorCodeRegistry.VALUES_FILE_PARSE_FAILED,
        troubleshootingSteps:
          `Open ${valuesFilePath} and correct the syntax reported above\n` +
          "Values files starting with '{' are parsed as strict JSON; a YAML flow mapping that starts with '{' must " +
          'be rewritten in block style or have all of its keys and string values quoted\n' +
          `Regenerate a cached values file by deleting it and re-running the command: rm ${valuesFilePath}\n` +
          'Cached values files live under the solo home directory (default ~/.solo) and are rewritten on the next run',
      },
      cause,
    );
  }
}
