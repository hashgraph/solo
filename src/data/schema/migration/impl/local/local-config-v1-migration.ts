// SPDX-License-Identifier: Apache-2.0

import {type SchemaMigration} from '../../api/schema-migration.js';
import {VersionRange} from '../../../../../business/utils/version-range.js';
import {Version} from '../../../../../business/utils/version.js';
import deepClone from 'deep-clone';
import {getSoloVersion} from '../../../../../core/helpers.js';
import {
  HEDERA_EXPLORER_VERSION,
  HEDERA_JSON_RPC_RELAY_VERSION,
  HEDERA_PLATFORM_VERSION,
  MIRROR_NODE_VERSION,
  SOLO_CHART_VERSION,
} from '../../../../../../version.js';
import os from 'os';
import {IllegalArgumentError} from '../../../../../business/errors/illegal-argument-error.js';
import {InvalidSchemaVersionError} from '../../api/invalid-schema-version-error.js';

export class LocalConfigV1Migration implements SchemaMigration {
  public get range(): VersionRange<number> {
    return VersionRange.fromIntegerVersion(0);
  }

  public get version(): Version<number> {
    return new Version(1);
  }

  public migrate(source: object): Promise<object> {
    if (!source) {
      // We should never pass null or undefined to this method, if this happens we should throw an error
      throw new IllegalArgumentError('source must not be null or undefined');
    }

    const clone = deepClone(source);

    if (clone.schemaVersion && clone.schemaVersion !== 0) {
      // this case should never happen considering the field was not present in version 0 and should default to zero
      // during this migration
      throw new InvalidSchemaVersionError(clone.schemaVersion, 0);
    }

    // Remove the legacy email address
    delete clone.userEmailAddress;

    // Migrate the solo version to the versions object
    clone.versions = {
      cli: clone.soloVersion ?? getSoloVersion(),
      chart: SOLO_CHART_VERSION,
      consensusNode: HEDERA_PLATFORM_VERSION,
      mirrorNodeChart: MIRROR_NODE_VERSION,
      explorerChart: HEDERA_EXPLORER_VERSION,
      jsonRpcRelayChart: HEDERA_JSON_RPC_RELAY_VERSION,
      blockNodeChart: 'v0.0.0',
    };

    delete clone.soloVersion;

    // Migrate the deployments to an array
    const mdeps: object[] = [];
    for (const k in clone.deployments) {
      const d = clone.deployments[k];
      d.name = k;
      mdeps.push(d);
    }
    clone.deployments = mdeps;

    // Inject the new user identity object
    clone.userIdentity = {
      name: os.userInfo().username,
      hostname: os.hostname(),
    };

    // Set the schema version to the new version
    clone.schemaVersion = this.version.value;

    return clone;
  }
}
