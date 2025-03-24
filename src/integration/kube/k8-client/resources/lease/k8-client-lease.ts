// SPDX-License-Identifier: Apache-2.0

import {V1Lease, V1LeaseSpec, V1MicroTime, V1ObjectMeta} from '@kubernetes/client-node';
import {type Lease} from '../../../resources/lease/lease.js';
import {NamespaceName} from '../../../resources/namespace/namespace-name.js';

export class K8ClientLease implements Lease {
  public constructor(
    public readonly namespace: NamespaceName,
    public readonly leaseName: string,
    public readonly holderIdentity: string,
    public readonly durationSeconds: number,
    public readonly acquireTime?: Date,
    public readonly renewTime?: Date,
    public readonly resourceVersion?: string,
  ) {}

  public static fromV1Lease(v1Lease: V1Lease): Lease {
    return new K8ClientLease(
      NamespaceName.of(v1Lease.metadata.namespace),
      v1Lease.metadata.name,
      v1Lease.spec.holderIdentity,
      v1Lease.spec.leaseDurationSeconds,
      v1Lease.spec.acquireTime,
      v1Lease.spec.renewTime,
      v1Lease.metadata.resourceVersion,
    );
  }

  public static toV1Lease(lease: Lease): V1Lease {
    const v1Lease: V1Lease = new V1Lease();

    const metadata: V1ObjectMeta = new V1ObjectMeta();
    metadata.name = lease.leaseName;
    metadata.namespace = lease.namespace.name;
    metadata.resourceVersion = lease.resourceVersion;
    v1Lease.metadata = metadata;

    const spec: V1LeaseSpec = new V1LeaseSpec();
    spec.holderIdentity = lease.holderIdentity;
    spec.leaseDurationSeconds = lease.durationSeconds;
    spec.acquireTime = lease.acquireTime || new V1MicroTime();
    spec.renewTime = lease.renewTime;
    v1Lease.spec = spec;

    return v1Lease;
  }
}
