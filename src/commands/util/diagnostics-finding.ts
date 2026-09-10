// SPDX-License-Identifier: Apache-2.0

/**
 * Severity-ordered categories for diagnostics findings.
 *
 * Ordering (lowest value = highest severity in the report):
 *   1. image-pull       — container image could not be pulled; pod will never start.
 *   2. oom              — container was killed by the kernel due to memory exhaustion.
 *   3. pod-readiness    — pod is not Running or its readiness probe is failing.
 *   4. consensus-active — consensus node did not reach ACTIVE platform status.
 *   5. log-exception    — an exception/stack-trace was found in an application log.
 *   6. app-error        — an ERROR line was found in a pod's raw container log.
 */
export type DiagnosticsFindingCategory =
  'image-pull' | 'oom' | 'pod-readiness' | 'consensus-active' | 'log-exception' | 'app-error';

/** A single detected problem with its supporting evidence lines. */
export interface DiagnosticsFinding {
  category: DiagnosticsFindingCategory;
  title: string;
  /** Relative path of the source file (or "archive:entry") that triggered this finding. */
  source: string;
  /** Up to 14 verbatim lines from the source that match the failure pattern. */
  evidence: string[];
}
