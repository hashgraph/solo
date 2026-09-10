// SPDX-License-Identifier: Apache-2.0

import {type RedactOptions} from './redact-options.js';

/**
 * Utility class for redacting sensitive data from command-line arguments.
 *
 * Uses regex-based pattern matching to dynamically detect sensitive keys
 * rather than relying on a static list of keywords.
 */
export class SensitiveDataRedactor {
  /** The mask string used to replace sensitive values. */
  private static readonly REDACT_MASK: string = '******';

  /**
   * Regex pattern that matches common sensitive key names.
   * Covers passwords, secrets, tokens, keys, credentials, auth values,
   * API keys, passphrases, certificates, private keys, and private data.
   */
  private static readonly SENSITIVE_KEY_PATTERN: RegExp =
    /password|passwd|secret|token|key|credential|auth|privatekey|private|api[_-]?key|passphrase|certificate/i;

  /**
   * Determines whether a key name represents sensitive data.
   * @param key - The key name to check
   * @returns true if the key matches a known sensitive pattern
   */
  public static isSensitiveKey(key: string): boolean {
    return SensitiveDataRedactor.SENSITIVE_KEY_PATTERN.test(key);
  }

  /**
   * Redacts sensitive values from a command-line arguments array.
   *
   * Supports three redaction modes based on the provided options:
   * 1. **Flag-based**: Flags listed in `flagsToRedactNextArgument` cause the next argument to be fully masked.
   * 2. **Set-style**: Flags listed in `setStyleFlags` cause the next `key=value` argument to have its value
   *    masked if the key matches the sensitive pattern.
   * 3. **Inline key=value**: Any argument containing `=` where the key matches the sensitive pattern
   *    has its value masked.
   *
   * @param arguments_ - The arguments array to redact
   * @param options - Configuration for redaction behavior
   * @returns A new array with sensitive values replaced by the redact mask
   */
  public static redactArguments(arguments_: string[], options: RedactOptions = {}): string[] {
    const {flagsToRedactNextArgument = [], setStyleFlags = []} = options;

    // Split composite arguments that contain multiple key-value pairs within a single argument
    const splitArguments: string[] = [];
    for (let index: number = 0; index < arguments_.length; index++) {
      const argument: string = arguments_[index];
      const precedingArgument: string | undefined = arguments_[index - 1];
      const preserveArgumentBoundaries: boolean =
        precedingArgument !== undefined &&
        (flagsToRedactNextArgument.includes(precedingArgument) || setStyleFlags.includes(precedingArgument));

      // Preserve values paired with flags because a single spawn argument can contain literal spaces.
      if (argument.includes(' ') && !preserveArgumentBoundaries) {
        splitArguments.push(...argument.split(' '));
      } else {
        splitArguments.push(argument);
      }
    }

    const redacted: string[] = [];

    for (let index: number = 0; index < splitArguments.length; index++) {
      const current: string = splitArguments[index];

      // Mode 1: Flag-based redaction (e.g. --password <value>)
      if (flagsToRedactNextArgument.includes(current)) {
        redacted.push(current);
        if (index + 1 < splitArguments.length) {
          redacted.push(SensitiveDataRedactor.REDACT_MASK);
          index++;
        }
        continue;
      }

      // Mode 2: Set-style redaction (e.g. --set key=value)
      if (setStyleFlags.includes(current)) {
        redacted.push(current);
        if (index + 1 < splitArguments.length) {
          const value: string = splitArguments[index + 1];
          redacted.push(SensitiveDataRedactor.redactKeyValueIfSensitive(value));
          index++;
        }
        continue;
      }

      // Mode 3: Inline key=value redaction (e.g. some-token=abc)
      if (current.includes('=')) {
        redacted.push(SensitiveDataRedactor.redactKeyValueIfSensitive(current));
        continue;
      }

      // Not sensitive — pass through unchanged
      redacted.push(current);
    }

    return redacted;
  }

  /**
   * Redacts the value portion of a `key=value` string if the key matches the sensitive pattern.
   * If there is no `=` or the key is not sensitive, the original string is returned unchanged.
   *
   * @param keyValue - A string potentially in `key=value` format
   * @returns The original string or the redacted version
   */
  private static redactKeyValueIfSensitive(keyValue: string): string {
    const equalsIndex: number = keyValue.indexOf('=');
    if (equalsIndex === -1) {
      return keyValue;
    }

    const key: string = keyValue.slice(0, equalsIndex);

    // Check both the full key and the last dot-separated segment
    // to handle nested keys like "something.something.password"
    const lastSegment: string = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;

    if (SensitiveDataRedactor.isSensitiveKey(key) || SensitiveDataRedactor.isSensitiveKey(lastSegment)) {
      return `${key}=${SensitiveDataRedactor.REDACT_MASK}`;
    }

    return keyValue;
  }
}
