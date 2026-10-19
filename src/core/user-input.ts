// SPDX-License-Identifier: Apache-2.0

/**
 * Sanitization helpers for user-supplied input.
 *
 * Per hiero-ledger/solo#4004, this class is the chokepoint for user-controlled values
 * (CLI flags, interactive prompts, environment variables) before they reach hostile sinks
 * (Helm templates, JSON/YAML parsers, filesystem paths).
 *
 * `sanitize` strips path-traversal/null bytes and backs {@link UserInput.safeFilenameComponent};
 * `escapeHelmTemplate` neutralizes Helm template delimiters in user values passed to charts;
 * `stripUnsafeJsonKeys` (built on `safeJsonKey`) scrubs prototype-pollution keys from parsed
 * untrusted documents; `safeFilenameComponent` normalizes a value that becomes a filename.
 * Regex escaping lives in {@link Regex.escape} (`src/business/utils/regex.ts`).
 */
export class UserInput {
  /**
   * The conservative sanitization pass applied to general user input. Strips:
   *
   * - Null bytes (security: terminates C-string-based syscalls early)
   * - Path-traversal sequences (`../`, `..\\`, leading `./`, leading `.\\`)
   *
   * Used as the first stage of {@link safeFilenameComponent}; also usable directly for
   * identifier-type inputs where traversal and null bytes are never valid (it deliberately keeps
   * path separators, so it is **not** appropriate for free-form path flags where `../` is valid).
   *
   * @param input - the raw user-supplied string.
   * @returns the sanitized string.
   */
  public static sanitize(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    let result: string = input.replaceAll('\0', '');
    // Remove parent-directory traversal: ../, ..\, and the URL-encoded variants
    // (%2e%2e%2f, ..%2f, ..%5c, etc.). The `while (test) { replace }` shape is the
    // canonical fixed-point sanitization pattern CodeQL's
    // `js/incomplete-multi-character-sanitization` rule recognizes — repeatedly
    // stripping until no traversal pattern remains, which closes overlap bypasses
    // like `....//` that single-pass replace would leave as `../`.
    const traversalPattern: RegExp = /\.\.[/\\]|%2e%2e(?:%2f|%5c|[/\\])|\.\.(?:%2f|%5c)/i;
    const traversalPatternGlobal: RegExp = /\.\.[/\\]|%2e%2e(?:%2f|%5c|[/\\])|\.\.(?:%2f|%5c)/gi;
    while (traversalPattern.test(result)) {
      result = result.replaceAll(traversalPatternGlobal, '');
    }
    // Remove leading single-dot prefixes that resolve relative to CWD when concatenated.
    result = result.replace(/^\.[/\\]+/, '');
    return result;
  }

  /**
   * Escape a value so Helm's Go template engine treats it as a literal string rather than a
   * template directive. Use for user-supplied strings passed into chart values that a chart might
   * render with `tpl` (e.g. ingress host/domain values).
   *
   * @param input - the user-supplied value.
   * @returns the value with template-significant characters escaped.
   */
  public static escapeHelmTemplate(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    return input.replaceAll('{', String.raw`\{`).replaceAll('}', String.raw`\}`);
  }

  /**
   * Returns true if {@link key} is safe to use as a property name on an object created
   * from JSON input. Rejects keys that would mutate the prototype chain.
   *
   * @param key - the candidate object key.
   * @returns true when the key is safe; false when it is a known prototype-pollution
   *   vector (`__proto__`, `constructor`, `prototype`, `__defineGetter__`,
   *   `__defineSetter__`).
   */
  public static safeJsonKey(key: string): boolean {
    if (typeof key !== 'string') {
      return false;
    }
    const forbidden: ReadonlySet<string> = new Set<string>([
      '__proto__',
      'constructor',
      'prototype',
      '__defineGetter__',
      '__defineSetter__',
      '__lookupGetter__',
      '__lookupSetter__',
    ]);
    return !forbidden.has(key);
  }

  /**
   * Recursively rebuild a value parsed from untrusted JSON/YAML, dropping every object key that
   * {@link safeJsonKey} rejects. This closes prototype-pollution vectors (`__proto__`,
   * `constructor`, `prototype`, …) that `JSON.parse` / `yaml.parse` surface as own properties
   * before the graph is merged into other objects.
   *
   * Arrays and primitives pass through structurally; only object keys are filtered. Plain data
   * graphs (the shape produced by JSON/YAML parsing) are the intended input — class instances are
   * not preserved.
   *
   * @param value - the parsed, untrusted value.
   * @returns the value with prototype-pollution keys removed at every depth.
   */
  public static stripUnsafeJsonKeys<T>(value: T): T {
    if (Array.isArray(value)) {
      return value.map((element: unknown): unknown => UserInput.stripUnsafeJsonKeys(element)) as T;
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (UserInput.safeJsonKey(key)) {
          result[key] = UserInput.stripUnsafeJsonKeys(entry);
        }
      }
      return result as T;
    }
    return value;
  }

  /**
   * Normalize a single path component for use as a filename. Runs {@link sanitize} first to strip
   * path-traversal sequences and null bytes, then replaces any remaining character outside
   * `[A-Za-z0-9._-]` with `_`, so the result is safe as a single path component across macOS,
   * Linux, and Windows.
   *
   * @param input - the user-supplied component (e.g. a deployment name).
   * @returns the safe filename component.
   */
  public static safeFilenameComponent(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }
    return UserInput.sanitize(input).replaceAll(/[^\dA-Za-z._-]/g, '_');
  }
}
