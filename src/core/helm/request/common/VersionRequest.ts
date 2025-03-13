// SPDX-License-Identifier: Apache-2.0

import { HelmExecutionBuilder } from '../../execution/HelmExecutionBuilder.js';
import { HelmRequest } from '../HelmRequest.js';

/**
 * A request to get the version of the Helm CLI.
 */
export class VersionRequest implements HelmRequest {
  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('version');
  }
} 