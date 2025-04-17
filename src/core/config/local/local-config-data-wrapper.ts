// SPDX-License-Identifier: Apache-2.0

import {type ToObject, type Validate} from '../../../types/index.js';
import {type Deployments, type LocalConfigData} from './local-config-data.js';
import {IsEmail, IsNotEmpty, IsObject, IsString, validateSync} from 'class-validator';
import {ErrorMessages} from '../../error-messages.js';
import {
  type ClusterReference,
  type ClusterReferences,
  type DeploymentName,
  type EmailAddress,
  type Realm,
  type Shard,
  type Version,
} from '../remote/types.js';
import {IsClusterReferences, IsDeployments} from '../../validator-decorators.js';
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

  @IsClusterReferences({message: ErrorMessages.LOCAL_CONFIG_CONTEXT_CLUSTER_MAPPING_FORMAT})
  @IsNotEmpty()
  private readonly _clusterRefs: ClusterReferences = {};

  public static readonly ALLOWED_KEYS: string[] = ['userEmailAddress', 'deployments', 'clusterRefs', 'soloVersion'];

  public constructor(
    userEmailAddress: EmailAddress,
    soloVersion: Version,
    deployments: Deployments,
    clusterReferences: ClusterReferences,
  ) {
    this._userEmailAddress = userEmailAddress;
    this._soloVersion = soloVersion;
    this._deployments = deployments;
    this._clusterRefs = clusterReferences;
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

  public get clusterRefs(): ClusterReferences {
    return structuredClone(this._clusterRefs);
  }

  public addClusterRef(clusterReference: ClusterReference, context: string): void {
    this._clusterRefs[clusterReference] = context;
  }

  public removeClusterRef(clusterReference: ClusterReference): void {
    delete this._clusterRefs[clusterReference];
  }

  public addDeployment(deployment: DeploymentName, namespace: NamespaceName, realm: Realm, shard: Shard): void {
    this._deployments[deployment] = {clusters: [], namespace: namespace.name, realm, shard};
  }

  public removeDeployment(deployment: DeploymentName): void {
    delete this._deployments[deployment];
  }

  public addClusterRefToDeployment(clusterReference: ClusterReference, deployment: DeploymentName): void {
    this._deployments[deployment].clusters.push(clusterReference);
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

    if (errors.length > 0) {
      // throw the first error:
      const property = Object.keys(errors[0]?.constraints);
      const error = property[0]
        ? new SoloError(errors[0].constraints[property[0]])
        : new SoloError(ErrorMessages.LOCAL_CONFIG_GENERIC);
      throw error;
    }
  }
}
