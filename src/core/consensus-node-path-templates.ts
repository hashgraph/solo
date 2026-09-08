// SPDX-License-Identifier: Apache-2.0

import * as constants from '../core/constants.js';

export class ConsensusNodePathTemplates {
  public static readonly BLOCK_STREAMS: string = `${constants.HEDERA_HGCAPP_DIR}/blockStreams`;

  public static readonly EVENT_STREAMS: string = `${constants.HEDERA_HGCAPP_DIR}/eventsStreams`;

  public static readonly RECORD_STREAMS: string = `${constants.HEDERA_HGCAPP_DIR}/recordStreams`;

  public static readonly DATA_ONBOARD: string = `${constants.HEDERA_HAPI_PATH}/data/onboard`;

  public static readonly DATA_SAVED: string = `${constants.HEDERA_HAPI_PATH}/data/saved`;

  public static readonly DATA_STATS: string = `${constants.HEDERA_HAPI_PATH}/data/stats`;

  public static readonly DATA_UPGRADE: string = `${constants.HEDERA_HAPI_PATH}/data/upgrade`;

  public static readonly OUTPUT: string = `${constants.HEDERA_HAPI_PATH}/output`;

  public static readonly DATA_CONFIG: string = `${constants.HEDERA_HAPI_PATH}/data/config`;

  public static readonly DATA_KEYS: string = `${constants.HEDERA_HAPI_PATH}/data/keys`;

  public static readonly DATA_LIB: string = `${constants.HEDERA_HAPI_PATH}/data/lib`;

  public static readonly DATA_APPS: string = `${constants.HEDERA_HAPI_PATH}/data/apps`;

  public static readonly STATE: string = `${constants.HEDERA_HAPI_PATH}/state`;

  public static readonly HEDERA_HAPI_PATH: string = `${constants.HEDERA_HAPI_PATH}/`;

  // ----- Config files -----

  public static readonly LOG4J2_XML: string = `${constants.HEDERA_HAPI_PATH}/log4j2.xml`;

  public static readonly SETTINGS_TXT: string = `${constants.HEDERA_HAPI_PATH}/settings.txt`;

  public static readonly BLOCK_NODES_JSON: string = `${this.DATA_CONFIG}/block-nodes.json`;

  public static readonly GENESIS_NETWORK_JSON: string = `${this.DATA_CONFIG}/${constants.GENESIS_NETWORK_FILE}`;

  /** Replaces the address book carried by a state restored from another network. */
  public static readonly OVERRIDE_NETWORK_JSON: string = `${this.DATA_CONFIG}/${constants.OVERRIDE_NETWORK_FILE}`;

  public static readonly CONFIG_ARCHIVE: string = `${this.DATA_CONFIG}/.archive`;

  /** Untouched copy of the address book solo installed, kept for restores after the live file changes. */
  public static readonly ARCHIVE_GENESIS_NETWORK_JSON: string = `${this.CONFIG_ARCHIVE}/${constants.GENESIS_NETWORK_FILE}`;

  public static readonly GENESIS_THROTTLES_JSON: string = `${this.DATA_CONFIG}/genesis-throttles.json`;

  public static readonly APPLICATION_PROPERTIES: string = `${this.DATA_CONFIG}/${constants.APPLICATION_PROPERTIES}`;
}
