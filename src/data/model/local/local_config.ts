// SPDX-License-Identifier: Apache-2.0

import {Exclude, Expose, Transform, TransformationType, Type} from 'class-transformer';
import {SemVer} from 'semver';
import {Deployment} from './deployment.js';

@Exclude()
export class LocalConfig {
  @Expose()
  @Transform(({value, type}) => {
    switch (type) {
      case TransformationType.PLAIN_TO_CLASS:
        return new SemVer(value);
      case TransformationType.CLASS_TO_PLAIN:
        return value.toString();
      default:
        return value;
    }
  })
  public soloVersion: SemVer;

  @Expose()
  @Type(() => Deployment)
  public deployments: Deployment[];

  @Expose()
  @Type(() => Map)
  public clusterRefs: Map<string, string>;

  constructor(soloVersion?: SemVer, deployments?: Deployment[], clusterRefs?: Map<string, string>) {
    this.soloVersion = soloVersion || new SemVer('0.0.0');
    this.deployments = deployments || [];
    this.clusterRefs = clusterRefs || new Map<string, string>();
  }
}
