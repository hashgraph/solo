// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {UserBreak} from './errors/user-break.js';
import {SilentBreak} from './errors/silent-break.js';

@injectable()
export class ErrorHandler {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public handle(error: Error | any): void {
    const error_ = this.extractBreak(error);
    if (error_ instanceof UserBreak) {
      this.handleUserBreak(error_);
    } else if (error_ instanceof SilentBreak) {
      this.handleSilentBreak(error_);
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
  private extractBreak(error: Error | any): UserBreak | SilentBreak | false {
    if (error instanceof UserBreak || error instanceof SilentBreak) {
      return error;
    }
    if (error?.cause) {
      return this.extractBreak(error.cause);
    }
    return false;
  }
}
