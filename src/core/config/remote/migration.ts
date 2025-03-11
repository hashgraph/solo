// SPDX-License-Identifier: Apache-2.0

import {SoloError} from '../../errors.js';
import {type EmailAddress, type IMigration, type Version} from './types.js';

export class Migration implements IMigration {
  private readonly _migratedAt: Date;
  private readonly _migratedBy: EmailAddress;
  private readonly _fromVersion: Version;

  public constructor(migratedAt: Date, migratedBy: EmailAddress, fromVersion: Version) {
    this._migratedAt = migratedAt;
    this._migratedBy = migratedBy;
    this._fromVersion = fromVersion;
    this.validate();
  }

  /* -------- Getters -------- */

  public get migratedAt(): Date {
    return this._migratedAt;
  }
  public get migratedBy(): EmailAddress {
    return this._migratedBy;
  }
  public get fromVersion(): Version {
    return this._fromVersion;
  }

  /* -------- Utilities -------- */

  public validate(): void {
    if (!(this.migratedAt instanceof Date)) {
      throw new SoloError(`Invalid migratedAt: ${this.migratedAt}`);
    }

    if (!this.migratedBy || typeof this.migratedBy !== 'string') {
      throw new SoloError(`Invalid migratedBy: ${this.migratedBy}`);
    }

    if (!this.fromVersion || typeof this.fromVersion !== 'string') {
      throw new SoloError(`Invalid fromVersion: ${this.fromVersion}`);
    }
  }

  public toObject(): IMigration {
    return {
      migratedAt: this.migratedAt,
      migratedBy: this.migratedBy,
      fromVersion: this.fromVersion,
    };
  }
}
