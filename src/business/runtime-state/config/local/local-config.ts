// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../../../../core/errors/solo-errors.js';
import {type Facade} from '../../facade/facade.js';
import {type LocalConfigSchema} from '../../../../data/schema/model/local/local-config-schema.js';
import {MutableFacadeArray} from '../../collection/mutable-facade-array.js';
import {Deployment} from './deployment.js';
import {DeploymentSchema} from '../../../../data/schema/model/local/deployment-schema.js';
import {UserIdentity} from '../common/user-identity.js';
import {UserIdentitySchema} from '../../../../data/schema/model/common/user-identity-schema.js';
import {MutableStringFacadeMap} from '../../collection/mutable-string-facade-map.js';
import {type StringFacade} from '../../facade/string-facade.js';
import {type FacadeMap} from '../../collection/facade-map.js';
import {type DeploymentName, type Realm, type Shard} from '../../../../types/index.js';
import {ApplicationVersions} from '../common/application-versions.js';
import {ApplicationVersionsSchema} from '../../../../data/schema/model/common/application-versions-schema.js';

export class LocalConfig implements Facade<LocalConfigSchema> {
  private readonly _clusterRefs: FacadeMap<string, StringFacade, string>;
  private readonly _deployments: MutableFacadeArray<Deployment, DeploymentSchema>;
  private readonly _userIdentity: UserIdentity;
  private readonly _versions: ApplicationVersions;

  public constructor(public readonly encapsulatedObject: LocalConfigSchema) {
    this._clusterRefs = new MutableStringFacadeMap(encapsulatedObject.clusterRefs ?? new Map<string, string>());

    this._deployments = new MutableFacadeArray<Deployment, DeploymentSchema>(
      Deployment,
      DeploymentSchema,
      encapsulatedObject.deployments ?? [],
    );

    this._userIdentity = new UserIdentity(encapsulatedObject.userIdentity ?? new UserIdentitySchema());
    this._versions = new ApplicationVersions(encapsulatedObject.versions ?? new ApplicationVersionsSchema());
  }

  public get deployments(): MutableFacadeArray<Deployment, DeploymentSchema> {
    return this._deployments;
  }

  public get userIdentity(): UserIdentity {
    return this._userIdentity;
  }

  public get clusterRefs(): FacadeMap<string, StringFacade, string> {
    return this._clusterRefs;
  }

  public get versions(): ApplicationVersions {
    return this._versions;
  }

  public deploymentByName(deploymentName: DeploymentName): Deployment {
    const deployment: Deployment = this.deployments.find((d: Deployment): boolean => d.name === deploymentName);
    if (!deployment) {
      throw new SoloErrors.deployment.notFound(`Deployment ${deploymentName} not found in local config`);
    }
    return deployment;
  }

  public realmForDeployment(deploymentName: DeploymentName): Realm {
    return this.deploymentByName(deploymentName).realm;
  }

  public shardForDeployment(deploymentName: DeploymentName): Shard {
    return this.deploymentByName(deploymentName).shard;
  }
}
