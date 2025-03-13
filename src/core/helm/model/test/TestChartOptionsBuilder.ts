// SPDX-License-Identifier: Apache-2.0

import {type TestChartOptions} from './TestChartOptions.js';
import {assertNotNull} from '../../HelmClient.js';

/**
 * Builder for creating TestChartOptions instances.
 */
export class TestChartOptionsBuilder {
  private options: Partial<TestChartOptions> = {};

  /**
   * Sets the namespace for the test.
   * @param namespace The namespace to test in
   */
  public withNamespace(namespace: string): this {
    assertNotNull(namespace, 'namespace must not be null');
    this.options.namespace = namespace.trim();
    return this;
  }

  /**
   * Sets the timeout duration in seconds.
   * @param timeout Timeout in seconds
   */
  public withTimeout(timeout: number): this {
    if (timeout < 0) {
      throw new Error('timeout must be non-negative');
    }
    this.options.timeout = timeout;
    return this;
  }

  /**
   * Sets whether to filter test logs.
   * @param filter Whether to filter logs
   */
  public withFilter(filter: boolean): this {
    this.options.filter = filter;
    return this;
  }

  /**
   * Builds the TestChartOptions instance.
   * @returns A new TestChartOptions instance
   */
  public build(): TestChartOptions {
    return this.options as TestChartOptions;
  }

  /**
   * Creates a new builder with default options.
   * @returns A new TestChartOptionsBuilder instance
   */
  public static defaults(): TestChartOptionsBuilder {
    return new TestChartOptionsBuilder()
      .withTimeout(300)
      .withFilter(true);
  }
}
