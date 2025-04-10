// SPDX-License-Identifier: Apache-2.0

import {type EmailAddress, type Version} from '../types.js';

export interface MigrationStruct {
  migratedAt: Date;
  migratedBy: EmailAddress;
  fromVersion: Version;
}
