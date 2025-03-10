/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type CoordinationV1Api,
  V1Lease,
  V1LeaseSpec,
  V1MicroTime,
  V1ObjectMeta,
  type V1Status,
} from '@kubernetes/client-node';
import {type Leases} from '../../../resources/lease/leases.js';
import {type NamespaceName} from '../../../resources/namespace/namespace_name.js';
import type http from 'node:http';
import {SoloError} from '../../../../errors.js';
import {getReasonPhrase, StatusCodes} from 'http-status-codes';
import {type SoloLogger} from '../../../../logging.js';
import {container} from 'tsyringe-neo';
import {sleep} from '../../../../helpers.js';
import {Duration} from '../../../../time/duration.js';
import {InjectTokens} from '../../../../dependency_injection/inject_tokens.js';
import {K8ClientLease} from './k8_client_lease.js';
import {type Lease} from '../../../resources/lease/lease.js';

export class K8ClientLeases implements Leases {
  private readonly logger: SoloLogger;

  constructor(private readonly coordinationApiClient: CoordinationV1Api) {
    this.logger = container.resolve(InjectTokens.SoloLogger);
  }

  public async create(
    namespace: NamespaceName,
    leaseName: string,
    holderName: string,
    durationSeconds: number,
  ): Promise<Lease> {
    const lease = new V1Lease();

    const metadata = new V1ObjectMeta();
    metadata.name = leaseName;
    metadata.namespace = namespace.name;
    lease.metadata = metadata;

    const spec = new V1LeaseSpec();
    spec.holderIdentity = holderName;
    spec.leaseDurationSeconds = durationSeconds;
    spec.acquireTime = new V1MicroTime();
    lease.spec = spec;

    const {response, body} = await this.coordinationApiClient
      .createNamespacedLease(namespace.name, lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to create namespaced lease');

    return K8ClientLease.fromV1Lease(body as V1Lease);
  }

  public async delete(namespace: NamespaceName, name: string): Promise<V1Status> {
    const {response, body} = await this.coordinationApiClient.deleteNamespacedLease(name, namespace.name).catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to delete namespaced lease');

    return body as V1Status;
  }

  public async read(namespace: NamespaceName, leaseName: string, timesCalled?: number): Promise<Lease> {
    const {response, body} = await this.coordinationApiClient
      .readNamespacedLease(leaseName, namespace.name)
      .catch(e => e);

    if (response?.statusCode === StatusCodes.INTERNAL_SERVER_ERROR && timesCalled < 4) {
      // could be k8s control plane has no resources available
      this.logger.debug(
        `Retrying readNamespacedLease(${leaseName}, ${namespace}) in 5 seconds because of ${getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR)}`,
      );
      await sleep(Duration.ofSeconds(5));
      return await this.read(namespace, leaseName, timesCalled + 1);
    }

    this.handleKubernetesClientError(response, body, 'Failed to read namespaced lease');

    return K8ClientLease.fromV1Lease(body);
  }

  public async renew(namespace: NamespaceName, leaseName: string, lease: Lease): Promise<Lease> {
    const v1Lease: V1Lease = K8ClientLease.toV1Lease(lease);
    v1Lease.spec.renewTime = new V1MicroTime();

    const {response, body} = await this.coordinationApiClient
      .replaceNamespacedLease(leaseName, namespace.name, v1Lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to renew namespaced lease');

    return K8ClientLease.fromV1Lease(body as V1Lease);
  }

  public async transfer(lease: Lease, newHolderName: string): Promise<Lease> {
    const v1Lease = K8ClientLease.toV1Lease(lease);
    v1Lease.spec.leaseTransitions++;
    v1Lease.spec.renewTime = new V1MicroTime();
    v1Lease.spec.holderIdentity = newHolderName;

    const {response, body} = await this.coordinationApiClient
      .replaceNamespacedLease(v1Lease.metadata.name, v1Lease.metadata.namespace, v1Lease)
      .catch(e => e);

    this.handleKubernetesClientError(response, body, 'Failed to transfer namespaced lease');

    return K8ClientLease.fromV1Lease(body as V1Lease);
  }

  /**
   * @param response - response object from the kubeclient call
   * @param error - body of the response becomes the error if the status is not OK
   * @param errorMessage - the error message to be passed in case it fails
   *
   * @throws SoloError - if the status code is not OK
   */
  private handleKubernetesClientError(
    response: http.IncomingMessage,
    error: Error | unknown,
    errorMessage: string,
  ): void {
    const statusCode = +response?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

    if (statusCode <= StatusCodes.ACCEPTED) return;
    errorMessage += `, statusCode: ${statusCode}`;
    this.logger.error(errorMessage, error);

    throw new SoloError(errorMessage, errorMessage, {statusCode: statusCode});
  }
}
