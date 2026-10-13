// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {IntervalLock} from '../../../src/core/lock/interval-lock.js';
import {LockHolder} from '../../../src/core/lock/lock-holder.js';
import {NamespaceName} from '../../../src/types/namespace/namespace-name.js';
import {type LockRenewalService} from '../../../src/core/lock/lock-renewal-service.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type K8} from '../../../src/integration/kube/k8.js';
import {type Namespaces} from '../../../src/types/namespace/namespaces.js';
import {type Leases} from '../../../src/integration/kube/resources/lease/leases.js';
import {type Lease} from '../../../src/integration/kube/resources/lease/lease.js';
import {LockAcquisitionError} from '../../../src/core/lock/lock-acquisition-error.js';
import {StatusCodes} from 'http-status-codes';
import {Duration} from '../../../src/core/time/duration.js';
import {type ObjectMeta} from '../../../src/integration/kube/resources/object-meta.js';
import {type Contexts} from '../../../src/integration/kube/resources/context/contexts.js';

describe('IntervalLock', (): void => {
  it('should ignore a renew conflict when latest lease is still held by the same lock holder', async (): Promise<void> => {
    const namespace: NamespaceName = NamespaceName.of('lock-conflict-test');
    const lockHolder: LockHolder = LockHolder.of('lock-user');
    const leaseName: string = 'lock-conflict-test';

    let readCallCounter: number = 0;
    let renewCallCounter: number = 0;
    let scheduleCallCounter: number = 0;

    const initialLease: Lease = createLease(namespace, leaseName, lockHolder.toJson(), '1');
    const latestLease: Lease = createLease(namespace, leaseName, lockHolder.toJson(), '2');

    const renewalService: LockRenewalService = {
      isScheduled: async (): Promise<boolean> => false,
      schedule: async (): Promise<number> => {
        scheduleCallCounter++;
        return 99;
      },
      cancel: async (): Promise<boolean> => true,
      cancelAll: async (): Promise<Map<number, boolean>> => new Map<number, boolean>(),
      calculateRenewalDelay: (): Duration => Duration.ofSeconds(1),
    };

    const leases: Leases = {
      create: async (): Promise<Lease> => {
        throw new Error('not used');
      },
      delete: async (): Promise<void> => {
        throw new Error('not used');
      },
      read: async (): Promise<Lease> => {
        readCallCounter++;
        return readCallCounter === 1 ? initialLease : latestLease;
      },
      renew: async (): Promise<Lease> => {
        renewCallCounter++;
        throw createConflictError();
      },
      transfer: async (): Promise<Lease> => {
        throw new Error('not used');
      },
    };

    const namespaces: Namespaces = {
      create: async (): Promise<boolean> => true,
      delete: async (): Promise<boolean> => true,
      list: async (): Promise<NamespaceName[]> => [],
      has: async (): Promise<boolean> => true,
      get: async (): Promise<ObjectMeta> => ({name: ''}),
    };

    const k8: K8 = {
      namespaces: (): Namespaces => namespaces,
      leases: (): Leases => leases,
    } as unknown as K8;

    const k8Factory: K8Factory = {
      getK8: (): K8 => k8,
      default: (): K8 => k8,
    };

    const lock: IntervalLock = new IntervalLock(
      k8Factory,
      renewalService,
      lockHolder,
      namespace,
      leaseName,
      20,
      'test-context',
    );
    await lock.renew();

    expect(readCallCounter).to.equal(2);
    expect(renewCallCounter).to.equal(1);
    expect(scheduleCallCounter).to.equal(1);
  });

  it('should fail renew when conflict resolution reads a lease owned by another holder', async (): Promise<void> => {
    const namespace: NamespaceName = NamespaceName.of('lock-conflict-fail-test');
    const lockHolder: LockHolder = LockHolder.of('lock-user');
    const otherLockHolder: LockHolder = LockHolder.of('other-user');
    const leaseName: string = 'lock-conflict-fail-test';

    let readCallCounter: number = 0;

    const initialLease: Lease = createLease(namespace, leaseName, lockHolder.toJson(), '1');
    const conflictingLease: Lease = createLease(namespace, leaseName, otherLockHolder.toJson(), '2');

    const renewalService: LockRenewalService = {
      isScheduled: async (): Promise<boolean> => false,
      schedule: async (): Promise<number> => 99,
      cancel: async (): Promise<boolean> => true,
      cancelAll: async (): Promise<Map<number, boolean>> => new Map<number, boolean>(),
      calculateRenewalDelay: (): Duration => Duration.ofSeconds(1),
    };

    const leases: Leases = {
      create: async (): Promise<Lease> => {
        throw new Error('not used');
      },
      delete: async (): Promise<void> => {
        throw new Error('not used');
      },
      read: async (): Promise<Lease> => {
        readCallCounter++;
        return readCallCounter === 1 ? initialLease : conflictingLease;
      },
      renew: async (): Promise<Lease> => {
        throw createConflictError();
      },
      transfer: async (): Promise<Lease> => {
        throw new Error('not used');
      },
    };

    const namespaces: Namespaces = {
      create: async (): Promise<boolean> => true,
      delete: async (): Promise<boolean> => true,
      list: async (): Promise<NamespaceName[]> => [],
      has: async (): Promise<boolean> => true,
      get: async (): Promise<ObjectMeta> => ({name: ''}),
    };

    const k8: K8 = {
      namespaces: (): Namespaces => namespaces,
      leases: (): Leases => leases,
    } as unknown as K8;

    const k8Factory: K8Factory = {
      getK8: (): K8 => k8,
      default: (): K8 => k8,
    };

    const lock: IntervalLock = new IntervalLock(
      k8Factory,
      renewalService,
      lockHolder,
      namespace,
      leaseName,
      20,
      'test-context',
    );
    await expect(lock.renew()).to.be.rejectedWith(LockAcquisitionError);
  });

  it('should stop renewal gracefully when namespace is being terminated (403 Forbidden)', async (): Promise<void> => {
    const namespace: NamespaceName = NamespaceName.of('lock-namespace-terminating-test');
    const lockHolder: LockHolder = LockHolder.of('lock-user');
    const leaseName: string = 'lock-namespace-terminating-test';

    let createCallCounter: number = 0;
    let cancelCallCounter: number = 0;
    let cancelledScheduleId: number | undefined;

    const renewalService: LockRenewalService = {
      isScheduled: async (): Promise<boolean> => false,
      schedule: async (): Promise<number> => 99,
      cancel: async (scheduleId: number): Promise<boolean> => {
        cancelCallCounter++;
        cancelledScheduleId = scheduleId;
        return true;
      },
      cancelAll: async (): Promise<Map<number, boolean>> => new Map<number, boolean>(),
      calculateRenewalDelay: (): Duration => Duration.ofSeconds(1),
    };

    const leases: Leases = {
      create: async (): Promise<Lease> => {
        createCallCounter++;
        if (createCallCounter === 1) {
          return createLease(namespace, leaseName, lockHolder.toJson(), '1');
        }
        throw createForbiddenError();
      },
      delete: async (): Promise<void> => {
        throw new Error('not used');
      },
      read: async (): Promise<Lease> => undefined as unknown as Lease,
      renew: async (): Promise<Lease> => {
        throw new Error('not used');
      },
      transfer: async (): Promise<Lease> => {
        throw new Error('not used');
      },
    };

    const namespaces: Namespaces = {
      create: async (): Promise<boolean> => true,
      delete: async (): Promise<boolean> => true,
      list: async (): Promise<NamespaceName[]> => [],
      has: async (): Promise<boolean> => true,
      get: async (): Promise<ObjectMeta> => ({name: ''}),
    };

    const k8: K8 = {
      namespaces: (): Namespaces => namespaces,
      leases: (): Leases => leases,
    } as unknown as K8;

    const k8Factory: K8Factory = {
      getK8: (): K8 => k8,
      default: (): K8 => k8,
    };

    const lock: IntervalLock = new IntervalLock(
      k8Factory,
      renewalService,
      lockHolder,
      namespace,
      leaseName,
      20,
      'test-context',
    );

    // First renew: creates lease successfully and sets scheduleId = 99
    await lock.renew();
    expect(createCallCounter).to.equal(1);

    // Second renew: namespace is being terminated → 403 → should cancel schedule and return without error
    await lock.renew();
    expect(createCallCounter).to.equal(2);
    expect(cancelCallCounter).to.equal(1);
    expect(cancelledScheduleId).to.equal(99);
  });

  describe('multi-cluster', (): void => {
    const namespace: NamespaceName = NamespaceName.of('multi-cluster-lock-test');
    const renewalService: LockRenewalService = {
      isScheduled: async (): Promise<boolean> => false,
      schedule: async (): Promise<number> => 99,
      cancel: async (): Promise<boolean> => true,
      cancelAll: async (): Promise<Map<number, boolean>> => new Map<number, boolean>(),
      calculateRenewalDelay: (): Duration => Duration.ofSeconds(1),
    };

    it('should acquire, renew and release on the given context, not on the kube current context', async (): Promise<void> => {
      const clusters: Map<string, FakeCluster> = new Map<string, FakeCluster>([
        ['context-1', createFakeCluster()],
        ['context-2', createFakeCluster()],
      ]);
      const k8Factory: K8Factory = createFakeK8Factory(clusters, (): string => 'context-2');

      const lock: IntervalLock = new IntervalLock(
        k8Factory,
        renewalService,
        LockHolder.of('lock-user'),
        namespace,
        undefined,
        20,
        'context-1',
      );

      await lock.acquire();
      expect(clusters.get('context-1').leases.size).to.equal(1);

      await lock.renew();
      expect(clusters.get('context-1').renewCount).to.equal(1);
      expect(await lock.isAcquired()).to.be.true;

      await lock.release(true);
      expect(clusters.get('context-1').leases.size).to.equal(0);
      expect(clusters.get('context-2').touched).to.be.false;
    });

    it('should keep using the kube current context from creation time when no context is given', async (): Promise<void> => {
      const clusters: Map<string, FakeCluster> = new Map<string, FakeCluster>([
        ['context-1', createFakeCluster()],
        ['context-2', createFakeCluster()],
      ]);
      let currentContext: string = 'context-1';
      const k8Factory: K8Factory = createFakeK8Factory(clusters, (): string => currentContext);

      const lock: IntervalLock = new IntervalLock(k8Factory, renewalService, LockHolder.of('lock-user'), namespace);
      await lock.acquire();

      // e.g. `kubectl config use-context` or `kind create cluster` while the command is running
      currentContext = 'context-2';
      await lock.renew();
      await lock.release(true);

      expect(clusters.get('context-1').renewCount).to.equal(1);
      expect(clusters.get('context-1').leases.size).to.equal(0);
      expect(clusters.get('context-2').touched).to.be.false;
    });
  });
});

type FakeCluster = {k8: K8; leases: Map<string, Lease>; renewCount: number; touched: boolean};

function createFakeCluster(): FakeCluster {
  const cluster: FakeCluster = {k8: undefined, leases: new Map<string, Lease>(), renewCount: 0, touched: false};
  const leases: Leases = {
    create: async (
      namespace: NamespaceName,
      leaseName: string,
      holderName: string,
      durationSeconds: number,
    ): Promise<Lease> => {
      cluster.touched = true;
      const lease: Lease = {...createLease(namespace, leaseName, holderName, '1'), durationSeconds};
      cluster.leases.set(leaseKey(namespace, leaseName), lease);
      return lease;
    },
    delete: async (namespace: NamespaceName, leaseName: string): Promise<void> => {
      cluster.touched = true;
      cluster.leases.delete(leaseKey(namespace, leaseName));
    },
    read: async (namespace: NamespaceName, leaseName: string): Promise<Lease> => {
      cluster.touched = true;
      if (!cluster.leases.has(leaseKey(namespace, leaseName))) {
        throw createNotFoundError();
      }
      return cluster.leases.get(leaseKey(namespace, leaseName));
    },
    renew: async (namespace: NamespaceName, leaseName: string, lease: Lease): Promise<Lease> => {
      cluster.touched = true;
      cluster.renewCount++;
      const renewed: Lease = {...lease, renewTime: new Date()};
      cluster.leases.set(leaseKey(namespace, leaseName), renewed);
      return renewed;
    },
    transfer: async (): Promise<Lease> => {
      throw new Error('not used');
    },
  };

  const namespaces: Namespaces = {
    create: async (): Promise<boolean> => true,
    delete: async (): Promise<boolean> => true,
    list: async (): Promise<NamespaceName[]> => [],
    has: async (): Promise<boolean> => true,
    get: async (): Promise<ObjectMeta> => ({name: ''}),
  };

  cluster.k8 = {namespaces: (): Namespaces => namespaces, leases: (): Leases => leases} as unknown as K8;
  return cluster;
}

function leaseKey(namespace: NamespaceName, leaseName: string): string {
  return `${namespace.name}/${leaseName}`;
}

function createFakeK8Factory(clusters: Map<string, FakeCluster>, currentContext: () => string): K8Factory {
  return {
    getK8: (context: string): K8 => clusters.get(context ?? currentContext()).k8,
    default: (): K8 =>
      ({
        ...clusters.get(currentContext()).k8,
        namespaces: (): Namespaces => clusters.get(currentContext()).k8.namespaces(),
        leases: (): Leases => clusters.get(currentContext()).k8.leases(),
        contexts: (): Contexts => ({readCurrent: (): string => currentContext()}) as unknown as Contexts,
      }) as unknown as K8,
  };
}

function createNotFoundError(): Error & {meta: {statusCode: number}} {
  const error: Error & {meta: {statusCode: number}} = new Error('Not Found') as Error & {meta: {statusCode: number}};
  error.meta = {statusCode: StatusCodes.NOT_FOUND};
  return error;
}

function createLease(
  namespace: NamespaceName,
  leaseName: string,
  holderIdentity: string,
  resourceVersion: string,
): Lease {
  return {
    namespace,
    leaseName,
    holderIdentity,
    durationSeconds: 20,
    acquireTime: new Date(),
    renewTime: new Date(),
    resourceVersion,
  };
}

function createConflictError(): Error & {meta: {statusCode: number}} {
  const error: Error & {meta: {statusCode: number}} = new Error('Conflict while replacing lease') as Error & {
    meta: {statusCode: number};
  };
  error.meta = {statusCode: StatusCodes.CONFLICT};
  return error;
}

function createForbiddenError(): Error & {meta: {statusCode: number}} {
  const error: Error & {meta: {statusCode: number}} = new Error('Forbidden: namespace is being terminated') as Error & {
    meta: {statusCode: number};
  };
  error.meta = {statusCode: StatusCodes.FORBIDDEN};
  return error;
}
