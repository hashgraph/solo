// SPDX-License-Identifier: Apache-2.0

/**
 * Represents a chart and is used to interact with the Helm install and uninstall commands.
 */
export class Chart {
  /**
   * Creates a new Chart instance.
   * @param name the name of the Helm chart.
   * @param repoName the name of repository which contains the Helm chart.
   */
  constructor(
    public readonly name: string,
    public readonly repoName?: string,
  ) {}

  /**
   * Returns a string representation of the chart.
   * If repoName is provided, returns "repoName/name", otherwise just returns "name".
   */
  toString(): string {
    if (!this.repoName?.trim()) {
      return this.name;
    }
    return `${this.repoName}/${this.name}`.replace(/\/$/, '');
  }

  /**
   * Returns the qualified name of the chart (same as toString).
   */
  qualified(): string {
    return this.toString();
  }

  /**
   * Returns the unqualified name of the chart (just the name without the repo).
   */
  unqualified(): string {
    return this.name;
  }
}
