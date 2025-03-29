// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to list all Helm repositories.
 */
export class RepositoryListRequest implements HelmRequest {
  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('repo', 'list').argument('output', 'json');
  }
}
