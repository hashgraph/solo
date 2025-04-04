// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type Options} from '../options.js';

/**
 * Represents the options to use when testing a chart.
 *
 * @property filter - Specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to
 *                   exclude a test (can specify multiple or separate values with commas: name=test1,name=test2)
 * @property timeout - Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s)
 */
export class TestChartOptions implements Options {
  /**
   * Creates a new instance of TestChartOptions.
   * @param filter - The test filter
   * @param timeout - The operation timeout
   * @param namespace
   */
  constructor(
    public readonly filter?: string,
    public readonly timeout?: string,
    public readonly namespace?: string,
  ) {}

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to
   */
  apply(builder: HelmExecutionBuilder): void {
    if (this.filter?.trim()) {
      builder.argument('filter', this.filter.trim());
    }
    if (this.timeout?.trim()) {
      builder.argument('timeout', this.timeout.trim());
    }
    if (this.namespace?.trim()) {
      builder.argument('namespace', this.namespace.trim());
    }
  }
}
