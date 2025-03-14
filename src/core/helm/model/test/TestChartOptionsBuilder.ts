// SPDX-License-Identifier: Apache-2.0

import {TestChartOptions} from './TestChartOptions.js';

/**
 * The builder for the TestChartOptions.
 */
export class TestChartOptionsBuilder {
  private _filter?: string;
  private _timeout?: string;

  /**
   * Returns an instance of the TestChartOptionsBuilder.
   * @returns the TestChartOptionsBuilder.
   */
  public static builder(): TestChartOptionsBuilder {
    return new TestChartOptionsBuilder();
  }

  /**
   * Specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to
   * exclude a test (can specify multiple or separate values with commas: name=test1,name=test2)
   *
   * @param filter Specify tests by attribute (currently "name") using attribute=value syntax or '!attribute=value' to
   *              exclude a test (can specify multiple or separate values with commas: name=test1,name=test2)
   * @returns the current TestChartOptionsBuilder.
   */
  public filter(value: string): TestChartOptionsBuilder {
    this._filter = value;
    return this;
  }

  /**
   * Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
   *
   * @param timeout Time to wait for any individual Kubernetes operation (like Jobs for hooks) (default 5m0s).
   * @returns the current TestChartOptionsBuilder.
   */
  public timeout(value: string): TestChartOptionsBuilder {
    this._timeout = value;
    return this;
  }

  /**
   * Builds the TestChartOptions instance.
   * @returns the TestChartOptions instance.
   */
  public build(): TestChartOptions {
    return new TestChartOptions(this._filter, this._timeout);
  }
}
