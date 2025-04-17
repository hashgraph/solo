// SPDX-License-Identifier: Apache-2.0

import {type Version} from './src/core/config/remote/types.js';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {PathEx} from './src/business/utils/path-ex.js';
import fs from 'node:fs';

/**
 * This file should only contain versions for dependencies and the function to get the Solo version.
 */
// TODO we should be consistent on the versioning format, let us drop the v prefix from the user, and manually add it
//  right before it required, this adds better semver library compatibility
export const HELM_VERSION: string = 'v3.14.2';
export const SOLO_CHART_VERSION: string = '0.50.0';
export const HEDERA_PLATFORM_VERSION: string = 'v0.59.5';
export const MIRROR_NODE_VERSION: string = 'v0.126.0';
export const HEDERA_EXPLORER_VERSION: string = '24.12.1';
export const HEDERA_JSON_RPC_RELAY_VERSION: string = 'v0.67.0';
export const INGRESS_CONTROLLER_VERSION: string = '0.14.5';

export function getSoloVersion(): Version {
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  const __filename: string = fileURLToPath(import.meta.url);
  const __dirname: string = path.dirname(__filename);

  const packageJsonPath: string = PathEx.resolve(__dirname, './package.json');
  const packageJson: {version: Version} = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}
