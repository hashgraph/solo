// SPDX-License-Identifier: Apache-2.0

import {type EmailAddress, type Version} from '../types.js';

export interface MigrationStructure {
  migratedAt: Date;
  migratedBy: EmailAddress;
  fromVersion: Version;
}
