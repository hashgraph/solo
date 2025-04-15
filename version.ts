// SPDX-License-Identifier: Apache-2.0

import {type Version} from './src/core/config/remote/types.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PathEx} from './src/business/utils/path-ex.js';
import fs from 'node:fs';

/**
 * This file should only contain versions for dependencies and the function to get the Solo version.
 */

export const HELM_VERSION = 'v3.14.2';
export const SOLO_CHART_VERSION = '0.50.0';
export const HEDERA_PLATFORM_VERSION = 'v0.59.5';
export const MIRROR_NODE_VERSION = 'v0.126.0';
export const HEDERA_EXPLORER_VERSION = '24.12.1';
export const HEDERA_JSON_RPC_RELAY_VERSION = 'v0.67.0';
export const INGRESS_CONTROLLER_VERSION = '0.14.5';
export const BLOCK_NODE_VERSION = '0.7.0';

export function getSoloVersion(): Version {
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const packageJsonPath = PathEx.resolve(__dirname, './package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}
