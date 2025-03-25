// SPDX-License-Identifier: Apache-2.0

export interface PodCondition {
  /**
   * The type of the condition
   */
  readonly type: string;

  /**
   * The status of the condition
   */
  readonly status: string;
}
