// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';

/**
 * Options for testing a Helm chart.
 */
export class TestChartOptions {
  constructor(
    public readonly filter?: string,
    public readonly timeout?: string
  ) {}

  /**
   * Creates a new builder for TestChartOptions.
   */
  static builder(): TestChartOptionsBuilder {
    return new TestChartOptionsBuilder();
  }

  /**
   * Applies the options to the given builder.
   * @param builder The builder to apply the options to
   */
  apply(builder: HelmExecutionBuilder): void {
    if (this.filter) {
      builder.argument('filter', this.filter);
    }
    if (this.timeout) {
      builder.argument('timeout', this.timeout);
    }
  }
}

/**
 * Builder for TestChartOptions.
 */
export class TestChartOptionsBuilder {
  private _filter?: string;
  private _timeout?: string;

  /**
   * Specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to
   * exclude a test (can specify multiple or separate values with commas: name=test1,name=test2)
   */
  filter(value: string): TestChartOptionsBuilder {
    this._filter = value;
    return this;
  }

  /**
   * Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
   */
  timeout(value: string): TestChartOptionsBuilder {
    this._timeout = value;
    return this;
  }

  /**
   * Build the TestChartOptions instance.
   */
  build(): TestChartOptions {
    return new TestChartOptions(
      this._filter,
      this._timeout
    );
  }
} 