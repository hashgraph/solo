// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';
import {InjectTokens} from './dependency_injection/inject_tokens.js';
import {patchInject} from './dependency_injection/container_helper.js';
import {type SoloLogger} from './logging.js';
import {UserBreak} from './errors.js';

@injectable()
export class ErrorHandler {
  constructor(@inject(InjectTokens.SoloLogger) private readonly logger: SoloLogger) {
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
  }

  public handle(error: Error | any): void {
    const userBreak = this.extractUserBreak(error);
    if (userBreak) {
      this.handleUserBreak(userBreak);
    } else {
      this.handleError(error);
    }
  }

  private handleUserBreak(userBreak: UserBreak): void {
    this.logger.showUser(userBreak.message);
  }

  private handleError(error: Error | any): void {
    this.logger.showUserError(error);
  }

  /**
   * Recursively checks if an error is or is caused by a UserBreak
   * Returns the UserBreak if found, otherwise false
   * @param err
   */
  private extractUserBreak(err: Error | any): UserBreak | false {
    if (err instanceof UserBreak) {
      return err;
    }
    if (err?.cause) {
      return this.extractUserBreak(err.cause);
    }
    return false;
  }
}
