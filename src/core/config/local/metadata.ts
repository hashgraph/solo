/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type DataObject} from './data_object.js';
import {type SemVer} from 'semver';

export interface Metadata extends DataObject<Metadata> {
  /**
   * The schema version of local config object. This is used to determine how to parse and migrate the object.
   */
  schemaVersion: number;

  /**
   * The revision of the local config file. This is incremented every time the file is written/modified.
   */
  revision: number;

  /**
   * The version of the Solo CLI application that wrote the local config file.
   */
  soloVersion: SemVer;

  /**
   * The version of the Solo Helm chart that was used to deploy the Solo platform.
   */
  chartsVersion: SemVer;

  /**
   * The timestamp of the last time the local config file was written/modified.
   */
  lastModified: Date;
}
