// SPDX-License-Identifier: Apache-2.0

import {type SubprocessCommandProfile} from './subprocess-command-profile.js';

/**
 * Optional settings for {@link ShellRunner.run}, modeled loosely on Node's `SpawnOptions`. Grouping the
 * less-common, mostly-defaulted parameters into an options object avoids threading positional
 * `undefined`/`false` values through a long signature just to reach a single trailing argument.
 */
export interface ShellRunOptions {
  /** Echo command output to the user as it is produced. Defaults to false. */
  verbose?: boolean;
  /** Spawn the process detached from the parent. Defaults to false. */
  detached?: boolean;
  /**
   * Selects the minimal environment built for the spawned command (see
   * {@link SubprocessEnvironment}). Defaults to 'generic' (common base set only). Callers that
   * run a specific tool should set the matching profile so it receives the variables it needs.
   */
  commandProfile?: SubprocessCommandProfile;
  /** Extra environment variables applied on top of the minimal environment. Defaults to {}. */
  environmentVariablesToAppend?: Record<string, string>;
  /** Hard timeout in milliseconds for the whole command. */
  timeoutMs?: number;
  /** Run the command through a shell. Defaults to false. */
  useShell?: boolean;
  /** Timeout in milliseconds after which the command is killed if it produces no output. */
  idleTimeoutMs?: number;
  /** Working directory (cwd) for the spawned process. */
  workingDirectory?: string;
  /**
   * Marks the command as an expected/best-effort probe: a non-zero exit or spawn error is logged at
   * `debug` instead of `error`. The returned promise still rejects so callers keep their existing
   * catch handling. Defaults to false.
   */
  bestEffort?: boolean;
}
