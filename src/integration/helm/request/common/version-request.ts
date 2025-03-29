// SPDX-License-Identifier: Apache-2.0

import {type HelmExecutionBuilder} from '../../execution/helm-execution-builder.js';
import {type HelmRequest} from '../helm-request.js';

/**
 * A request to get the version of the Helm CLI.
 */
export class VersionRequest implements HelmRequest {
  apply(builder: HelmExecutionBuilder): void {
    builder.subcommands('version').argument('template', '{\\"version\\":\\"{{.Version}}\\"}');
  }
}
