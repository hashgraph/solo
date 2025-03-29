// SPDX-License-Identifier: Apache-2.0

import {SemanticVersion} from '../base/api/version/semantic-version.js';

/**
 * The response from the helm version command.
 */
export class Version {
  constructor(public readonly version: string) {}

  /**
   * Returns a SemanticVersion representation of the version.
   * @returns the helm version
   */
  asSemanticVersion(): SemanticVersion {
    let safeVersion = this.version.trim();

    if (safeVersion.startsWith('v')) {
      safeVersion = safeVersion.substring(1);
    }

    return SemanticVersion.parse(safeVersion);
  }
}
