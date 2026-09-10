// SPDX-License-Identifier: Apache-2.0

/** A literal value emitted into a generated falcon-values.yaml section. */
export type FalconOverrideValue = string | number | boolean | null;

/**
 * Parsed shape of `resources/one-shot-falcon-prepare.yaml`, the data-only configuration that drives
 * `solo one-shot falcon prepare`. See that file for the field semantics and the override-value
 * grammar (`${config.<key>}`, `${default}`, or a literal).
 */
export interface FalconPrepareSpec {
  /** Flag names (CommandFlag.name) excluded from every generated section. */
  blockedFlags: string[];

  /** Ordered list of sections to emit into the generated values file. */
  sections: Array<{
    /** Output section key (e.g. `network`, `consensusNode`). */
    name: string;
    /** Registry key for the command flag-list to enumerate (e.g. `network.deploy`). */
    flagsFrom: string;
    /** Override values, keyed by flag name, applied only when the flag is in the flag-list. */
    overrides?: Record<string, FalconOverrideValue>;
    /** Keys forced into the section regardless of the flag-list, keyed by flag name. */
    extraKeys?: Record<string, FalconOverrideValue>;
  }>;

  /** Interactive steps run after the base flag prompts. */
  prompts: Array<{
    type: 'confirm';
    /** Config field the answer is written to. */
    configKey: string;
    message: string;
    default: boolean;
    /** When true, the prompt is skipped in quiet mode and `quietValue` is used instead. */
    skipWhenQuiet?: boolean;
    quietValue?: FalconOverrideValue;
    /** Follow-up prompts run when a `confirm` step is answered true. */
    onTrue?: {
      /** Flag names to prompt for. */
      promptFlags: string[];
      /** Maps the resulting flag values into config fields. */
      setConfig: Array<{configKey: string; flag: string}>;
    };
  }>;
}
