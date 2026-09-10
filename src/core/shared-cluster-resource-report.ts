// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import {type SoloLogger} from './logging/solo-logger.js';

/**
 * Reports shared cluster-scoped resources (CRDs, ClusterRoles, operator charts) that solo found
 * already present and is about to reuse, so the user learns what was found — pre-existing
 * resource, unexpected version, foreign owner — instead of solo silently adopting a resource
 * another deployment or solo version installed. Reporting only: reconciling or replacing the
 * resource stays with the user.
 */
export class SharedClusterResourceReport {
  /** Label keys, in precedence order, that shared cluster resources use to advertise their version. */
  private static readonly VERSION_LABELS: string[] = ['app.kubernetes.io/version', 'operator.prometheus.io/version'];

  public static show(logger: SoloLogger, resource: string, context: string, found: string, expected?: string): void {
    const expectation: string = expected ? `, expected ${expected}` : '';
    logger.showUser(
      chalk.yellow(
        `⚠️  Reusing pre-existing ${resource} in context '${context}' — found ${found}${expectation}; Solo will reuse it as-is`,
      ),
    );
  }

  /** Formats a possibly-missing version for the report's found/expected slots. */
  public static formatVersion(version?: string): string {
    return version ? `version ${version}` : 'unknown version';
  }

  /** Extracts a version advertised by the resource's labels, formatted for the report's found/expected slots. */
  public static versionFromLabels(labels?: Record<string, string>): string {
    for (const label of SharedClusterResourceReport.VERSION_LABELS) {
      if (labels?.[label]) {
        return SharedClusterResourceReport.formatVersion(labels[label]);
      }
    }
    return SharedClusterResourceReport.formatVersion();
  }
}
