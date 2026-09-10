// SPDX-License-Identifier: Apache-2.0

import fs from 'node:fs';
import yaml from 'yaml';
import * as constants from '../../core/constants.js';
import {type FalconPrepareSpec} from './falcon-prepare-spec.js';

/**
 * Loads and caches the bundled `one-shot-falcon-prepare.yaml` spec that drives
 * `solo one-shot falcon prepare`.
 */
export class FalconPrepareSpecLoader {
  private static cached: FalconPrepareSpec | undefined;

  public static load(): FalconPrepareSpec {
    if (!FalconPrepareSpecLoader.cached) {
      const content: string = fs.readFileSync(constants.ONE_SHOT_FALCON_PREPARE_SPEC_FILE, 'utf8');
      FalconPrepareSpecLoader.cached = yaml.parse(content) as FalconPrepareSpec;
    }
    return FalconPrepareSpecLoader.cached;
  }
}
