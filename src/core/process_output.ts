// SPDX-License-Identifier: Apache-2.0

import {ProcessOutput} from 'listr2';
import {type SoloLogger} from './logging.js';

/** Uses the solo logger to handle process output from Listr2 */
export class CustomProcessOutput extends ProcessOutput {
  constructor(private readonly logger: SoloLogger) {
    super();
  }

  toStdout(chunk: string, eol = true) {
    chunk
      .toString()
      .split('\n')
      .forEach(line => {
        this.logger.debug(line);
      });
    return super.toStdout(chunk, eol);
  }

  toStderr(chunk: string, eol = true) {
    this.logger.error(chunk.toString());
    return super.toStderr(chunk, eol);
  }
}
