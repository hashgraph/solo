// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';
import {type ComponentId} from '../types/index.js';
import {type K8} from '../integration/kube/k8.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';

/**
 * Names of the namespace-scoped (and cluster-scoped) resources that belong to a single mirror node.
 *
 * The first mirror node in a namespace keeps the historical, unsuffixed names so that existing
 * deployments keep working untouched. Every additional mirror node in the same namespace gets the
 * same names suffixed with its component id, so that it has its own passwords secret, database,
 * database users and ingress controller.
 */
export class MirrorNodeResourceNames {
  /** Kubernetes limits the names of services and of most other resources to a DNS label of 63 characters. */
  private static readonly MAX_NAME_LENGTH: number = 63;

  /** The passwords secret the mirror chart renders for the primary mirror node; its name is hardcoded in the chart. */
  public static readonly CHART_PASSWORDS_SECRET_NAME: string = 'mirror-passwords';

  private static readonly DATABASE_NAME: string = 'mirror_node';

  private static readonly DATABASE_USERNAMES: Readonly<Record<MirrorNodeDatabaseUser, string>> = {
    owner: 'mirror_node',
    importer: 'mirror_importer',
    rest: 'mirror_rest',
    restjava: 'mirror_rest_java',
    grpc: 'mirror_grpc',
    graphql: 'mirror_graphql',
    rosetta: 'mirror_rosetta',
    web3: 'mirror_web3',
  };

  /**
   * @param id - the component id of the mirror node, or undefined for the primary mirror node that uses the legacy names
   */
  public constructor(private readonly id?: ComponentId) {}

  /** Names used by the first mirror node in a namespace and by every deployment created before multi mirror node support. */
  public static primary(): MirrorNodeResourceNames {
    return new MirrorNodeResourceNames();
  }

  public static forId(id: ComponentId): MirrorNodeResourceNames {
    return new MirrorNodeResourceNames(id);
  }

  /**
   * Resolves the names of a mirror node that is already deployed: it owns suffixed names only when its
   * suffixed passwords secret exists, otherwise it was deployed with the legacy names.
   */
  public static async resolveExisting(
    k8: K8,
    namespace: NamespaceName,
    id: ComponentId,
  ): Promise<MirrorNodeResourceNames> {
    const suffixed: MirrorNodeResourceNames = MirrorNodeResourceNames.forId(id);
    return (await k8.secrets().exists(namespace, suffixed.passwordsSecretName))
      ? suffixed
      : MirrorNodeResourceNames.primary();
  }

  /**
   * Resolves the names for a mirror node that is about to be deployed. It takes the legacy names unless
   * another mirror node already occupies them in the namespace. A mirror node that is already deployed
   * keeps the names it was deployed with.
   *
   * @param isChartInstalled - whether this mirror node's chart release already exists
   * @param hasOtherMirrorNodes - whether another mirror node is registered in the same namespace and cluster
   */
  public static async resolveForDeploy(
    k8: K8,
    namespace: NamespaceName,
    id: ComponentId,
    isChartInstalled: boolean,
    hasOtherMirrorNodes: boolean,
  ): Promise<MirrorNodeResourceNames> {
    const suffixed: MirrorNodeResourceNames = MirrorNodeResourceNames.forId(id);
    if (await k8.secrets().exists(namespace, suffixed.passwordsSecretName)) {
      return suffixed;
    }
    return isChartInstalled || !hasOtherMirrorNodes ? MirrorNodeResourceNames.primary() : suffixed;
  }

  /** True when this mirror node uses the historical names. */
  public get isPrimary(): boolean {
    return this.id === undefined;
  }

  /** Name of the secret holding the database passwords. */
  public get passwordsSecretName(): string {
    return this.dashed(MirrorNodeResourceNames.CHART_PASSWORDS_SECRET_NAME);
  }

  public get databaseName(): string {
    return this.underscored(MirrorNodeResourceNames.DATABASE_NAME);
  }

  public databaseUsername(user: MirrorNodeDatabaseUser): string {
    return this.underscored(MirrorNodeResourceNames.DATABASE_USERNAMES[user]);
  }

  /** All database users of this mirror node, keyed by the chart module that uses them. */
  public get databaseUsernames(): Readonly<Record<MirrorNodeDatabaseUser, string>> {
    const users: Partial<Record<MirrorNodeDatabaseUser, string>> = {};
    for (const user of Object.keys(MirrorNodeResourceNames.DATABASE_USERNAMES) as MirrorNodeDatabaseUser[]) {
      users[user] = this.databaseUsername(user);
    }
    return users as Record<MirrorNodeDatabaseUser, string>;
  }

  public get ingressClassName(): string {
    return this.dashed(constants.MIRROR_INGRESS_CLASS_NAME);
  }

  /** Value of the haproxy `controller-class` argument; the IngressClass `spec.controller` is derived from it. */
  public get ingressControllerClass(): string {
    return this.dashed(constants.MIRROR_INGRESS_CONTROLLER);
  }

  /**
   * Name of the ingress controller's resources (service, deployment and cluster-scoped RBAC). It embeds the namespace,
   * so it is shortened to the 63 characters Kubernetes allows, keeping the id suffix: the chart would otherwise
   * truncate the names of two mirror nodes in a long namespace to the same value.
   */
  public ingressControllerName(namespace: string): string {
    const suffix: string = this.isPrimary ? '' : `-${this.id}`;
    const base: string = `${constants.MIRROR_INGRESS_CONTROLLER}-${namespace}`;
    return `${base.slice(0, MirrorNodeResourceNames.MAX_NAME_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
  }

  /** Name of the ConfigMap haproxy creates for leader election of the ingress class. */
  public get ingressLeaderConfigMapName(): string {
    return `ingress-controller-leader-${this.ingressClassName}`;
  }

  public get tlsSecretName(): string {
    return this.dashed(constants.MIRROR_INGRESS_TLS_SECRET_NAME);
  }

  private dashed(name: string): string {
    return this.isPrimary ? name : `${name}-${this.id}`;
  }

  private underscored(name: string): string {
    return this.isPrimary ? name : `${name}_${this.id}`;
  }
}

/** The database users of a mirror node; the values are the names of the chart modules that use them. */
export type MirrorNodeDatabaseUser =
  'owner' | 'importer' | 'rest' | 'restjava' | 'grpc' | 'graphql' | 'rosetta' | 'web3';
