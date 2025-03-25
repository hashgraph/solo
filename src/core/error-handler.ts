// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type SoloLogger} from './logging.js';
import {UserBreak} from './errors/user-break.js';
import {SilentBreak} from './errors/silent-break.js';

@injectable()
export class ErrorHandler {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public handle(error: Error | any): void {
    const err = this.extractBreak(error);
    if (err instanceof UserBreak) {
      this.handleUserBreak(err);
    } else if (err instanceof SilentBreak) {
      this.handleSilentBreak(err);
    } else {
      this.handleError(error);
    }
  }

  private handleUserBreak(userBreak: UserBreak): void {
    this.logger.showUser(userBreak.message);
  }

  private handleSilentBreak(silentBreak: SilentBreak): void {
    this.logger.info(silentBreak.message);
  }

  private handleError(error: Error | any): void {
    this.logger.showUserError(error);
  }

  /**
   * Recursively checks if an error is or is caused by a UserBreak
   * Returns the UserBreak or SilentBreak if found, otherwise false
   * @param err
   */
  private extractBreak(err: Error | any): UserBreak | SilentBreak | false {
    if (err instanceof UserBreak || err instanceof SilentBreak) {
      return err;
    }
    if (err?.cause) {
      return this.extractBreak(err.cause);
    }
    return false;
  }
}
