// SPDX-License-Identifier: Apache-2.0

import {type ToObject, type Validate} from '../../../types/index.js';
import {type Deployments, type LocalConfigData} from './local-config-data.js';
import {IsEmail, IsNotEmpty, IsObject, IsString, validateSync} from 'class-validator';
import {ErrorMessages} from '../../error-messages.js';
import {
  type ClusterRef,
  type ClusterRefs,
  type DeploymentName,
  type EmailAddress,
  type Version,
} from '../remote/types.js';
import {IsClusterRefs, IsDeployments} from '../../validator-decorators.js';
import {SoloError} from '../../errors/solo-error.js';
import {type NamespaceName} from '../../../integration/kube/resources/namespace/namespace-name.js';

export class LocalConfigDataWrapper implements Validate, LocalConfigData, ToObject<LocalConfigData> {
  @IsEmail({}, {message: ErrorMessages.LOCAL_CONFIG_INVALID_EMAIL})
  private readonly _userEmailAddress: EmailAddress;

  @IsString({message: ErrorMessages.LOCAL_CONFIG_INVALID_SOLO_VERSION})
  @IsNotEmpty({message: ErrorMessages.LOCAL_CONFIG_INVALID_SOLO_VERSION})
  private readonly _soloVersion: Version;

  // The string is the name of the deployment, will be used as the namespace,
  // so it needs to be available in all targeted clusters
  @IsDeployments({message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT})
  @IsNotEmpty()
  @IsObject({message: ErrorMessages.LOCAL_CONFIG_INVALID_DEPLOYMENTS_FORMAT})
  private readonly _deployments: Deployments;

  @IsClusterRefs({message: ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT})
  @IsNotEmpty()
  private readonly _clusterRefs: ClusterRefs = {};

  public static readonly ALLOWED_KEYS: string[] = ['userEmailAddress', 'deployments', 'clusterRefs', 'soloVersion'];

  public constructor(
    userEmailAddress: EmailAddress,
    soloVersion: Version,
    deployments: Deployments,
    clusterRefs: ClusterRefs,
  ) {
    this._userEmailAddress = userEmailAddress;
    this._soloVersion = soloVersion;
    this._deployments = deployments;
    this._clusterRefs = clusterRefs;
    this.validate();
  }

  public get userEmailAddress(): EmailAddress {
    return this._userEmailAddress;
  }

  public get soloVersion(): Version {
    return this._soloVersion;
  }

  public get deployments(): Deployments {
    return structuredClone(this._deployments);
  }

  public get clusterRefs(): ClusterRefs {
    return structuredClone(this._clusterRefs);
  }

  public addClusterRef(clusterRef: ClusterRef, context: string): void {
    this._clusterRefs[clusterRef] = context;
  }

  public removeClusterRef(clusterRef: ClusterRef): void {
    delete this._clusterRefs[clusterRef];
  }

  public addDeployment(deployment: DeploymentName, namespace: NamespaceName): void {
    this._deployments[deployment] = {clusters: [], namespace: namespace.name};
  }

  public removeDeployment(deployment: DeploymentName): void {
    delete this._deployments[deployment];
  }

  public addClusterRefToDeployment(clusterRef: ClusterRef, deployment: DeploymentName): void {
    this._deployments[deployment].clusters.push(clusterRef);
  }

  public toObject(): LocalConfigData {
    return {
      deployments: this.deployments,
      clusterRefs: this.clusterRefs,
      soloVersion: this.soloVersion,
      userEmailAddress: this.userEmailAddress,
    };
  }

  public validate(): void {
    const errors = validateSync(this, {});

    if (errors.length) {
      // throw the first error:
      const prop = Object.keys(errors[0]?.constraints);
      if (prop[0]) {
        throw new SoloError(errors[0].constraints[prop[0]]);
      } else {
        throw new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
      }
    }
  }
}
