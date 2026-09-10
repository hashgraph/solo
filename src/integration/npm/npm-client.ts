// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from '../../core/dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {patchInject} from '../../core/dependency-injection/container-helper.js';
import {ShellRunner} from '../../core/shell-runner.js';
import {SubprocessCommandProfile} from '../../core/subprocess-command-profile.js';
import {OperatingSystem} from '../../business/utils/operating-system.js';

@injectable()
export class NpmClient {
  public constructor(@inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  /**
   * Returns the output of `npm list --global --depth=0` as an array of lines.
   */
  public async listGlobal(): Promise<string[]> {
    const shellRunner: ShellRunner = new ShellRunner(this.logger);
    return shellRunner.run('npm', ['list', '--global', '--depth=0'], {
      commandProfile: SubprocessCommandProfile.NPM,
      // npm is npm.cmd on Windows, and Node refuses to spawn .cmd files without a shell (CVE-2024-27980)
      useShell: OperatingSystem.isWin32(),
    });
  }
}
