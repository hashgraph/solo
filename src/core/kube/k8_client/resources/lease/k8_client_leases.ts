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
import {HttpError} from '@kubernetes/client-node/dist/gen/api/apis.js';

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
  ): Promise<V1Lease> {
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

    const {body} = await this.coordinationApiClient
      .createNamespacedLease(namespace.name, lease)
      .catch(e => this.handleKubernetesClientError(e, 'Failed to create namespaced lease'));

    return body as V1Lease;
  }

  public async delete(namespace: NamespaceName, name: string): Promise<V1Status> {
    const {body} = await this.coordinationApiClient
      .deleteNamespacedLease(name, namespace.name)
      .catch(e => this.handleKubernetesClientError(e, 'Failed to delete namespaced lease'));
    return body as V1Status;
  }

  public async read(namespace: NamespaceName, leaseName: string, timesCalled?: number): Promise<any> {
    try {
      const {response, body} = await this.coordinationApiClient
        .readNamespacedLease(leaseName, namespace.name)
        .catch(e => this.handleKubernetesClientError(e, 'Failed to read namespaced lease'));

      return body as V1Lease;
    } catch (e) {
      if (e?.response?.statusCode === StatusCodes.INTERNAL_SERVER_ERROR && timesCalled < 4) {
        // could be k8s control plane has no resources available
        this.logger.debug(
          `Retrying readNamespacedLease(${leaseName}, ${namespace}) in 5 seconds because of ${getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR)}`,
        );
        await sleep(Duration.ofSeconds(5));
        return await this.read(namespace, leaseName, timesCalled + 1);
      }
    }
  }

  public async renew(namespace: NamespaceName, leaseName: string, lease: V1Lease): Promise<V1Lease> {
    lease.spec.renewTime = new V1MicroTime();

    const {body} = await this.coordinationApiClient
      .replaceNamespacedLease(leaseName, namespace.name, lease)
      .catch(e => this.handleKubernetesClientError(e, 'Failed to renew namespaced lease'));

    return body as V1Lease;
  }

  public async transfer(lease: V1Lease, newHolderName: string): Promise<V1Lease> {
    lease.spec.leaseTransitions++;
    lease.spec.renewTime = new V1MicroTime();
    lease.spec.holderIdentity = newHolderName;

    const {body} = await this.coordinationApiClient
      .replaceNamespacedLease(lease.metadata.name, lease.metadata.namespace, lease)
      .catch(e => this.handleKubernetesClientError(e, 'Failed to transfer namespaced lease'));

    return body as V1Lease;
  }

  /**
   * @param err - error object from the kubeclient call
   * @param errorMessage - the error message to be passed in case it fails
   *
   * @throws SoloError - if the status code is not OK
   */
  private handleKubernetesClientError(err: Error | HttpError, errorMessage: string) {
    if (!(err instanceof HttpError)) throw err;
    const {response} = err;
    const statusCode = +response?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

    if (statusCode <= StatusCodes.ACCEPTED) return {response, body: err.body};
    errorMessage += `, statusCode: ${statusCode}`;
    throw new SoloError(errorMessage, errorMessage, {statusCode: statusCode});
  }
}
