// SPDX-License-Identifier: Apache-2.0

import {ProcessOutput} from 'listr2';
import {type SoloLogger} from './logging/solo-logger.js';

/** Uses the solo logger to handle process output from Listr2 */
export class CustomProcessOutput extends ProcessOutput {
  public constructor(private readonly logger: SoloLogger) {
    super();
  }

  public override toStdout(chunk: string, eol = true) {
    for (const line of chunk.toString().split('\n')) {
      this.logger.debug(line);
    }
    return super.toStdout(chunk, eol);
  }

  public override toStderr(chunk: string, eol = true) {
    this.logger.error(chunk.toString());
    return super.toStderr(chunk, eol);
  }
}
