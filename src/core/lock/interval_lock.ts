// SPDX-License-Identifier: Apache-2.0

import {MissingArgumentError, SoloError} from '../errors.js';
import {type K8Factory} from '../kube/k8_factory.js';
import {LockHolder} from './lock_holder.js';
import {sleep} from '../helpers.js';
import {Duration} from '../time/duration.js';
import {type Lock} from './lock.js';
import {StatusCodes} from 'http-status-codes';
import {type NamespaceName} from '../kube/resources/namespace/namespace_name.js';
import {type Lease} from '../kube/resources/lease/lease.js';
import {type LockRenewalService} from './lock_renewal_service.js';
import {LockAcquisitionError} from './lock_acquisition_error.js';
import {LockRelinquishmentError} from './lock_relinquishment_error.js';
import {InjectTokens} from '../dependency_injection/inject_tokens.js';
import {type SoloLogger} from '../logging.js';
import {container} from 'tsyringe-neo';

/**
 * Concrete implementation of a Kubernetes time-based mutually exclusive lock via the Coordination API.
 * Applies a namespace/deployment wide lock to ensure that only one process, machine, and user can hold the lock at a time.
 * The lock is automatically renewed in the background to prevent expiration and ensure the holder maintains the lock.
 * If the process die, the lock is automatically released after the lock duration.
 *
 * @public
 */
export class IntervalLock implements Lock {
  /** The default duration in seconds for which the lock is to be held before being considered expired. */
  public static readonly DEFAULT_LEASE_DURATION = 20;

  /** The holder of the lock. */
  private readonly _lockHolder: LockHolder;

  /** The namespace which contains the lease. */
  private readonly _namespace: NamespaceName;

  /** The name of the lease. */
  private readonly _leaseName: string;

  /** The duration in seconds for which the lease is to be held. */
  private readonly _durationSeconds: number;

  /** The identifier of the scheduled lease renewal. */
  private _scheduleId: number | null = null;

  /**
   * @param k8Factory - Injected kubernetes K8Factory need by the methods to create, renew, and delete leases.
   * @param renewalService - Injected lock renewal service need to support automatic (background) lock renewals.
   * @param lockHolder - The holder of the lock.
   * @param namespace - The namespace in which the lease is to be acquired.
   * @param leaseName - The name of the lease to be acquired; if not provided, the namespace is used.
   * @param durationSeconds - The duration in seconds for which the lock is to be held; if not provided, the default value is used.
   */
  public constructor(
    readonly k8Factory: K8Factory,
    readonly renewalService: LockRenewalService,
    lockHolder: LockHolder,
    namespace: NamespaceName,
    leaseName: string | null = null,
    durationSeconds: number | null = null,
  ) {
    if (!k8Factory) throw new MissingArgumentError('k8Factory is required');
    if (!renewalService) throw new MissingArgumentError('renewalService is required');
    if (!lockHolder) throw new MissingArgumentError('_lockHolder is required');
    if (!namespace) throw new MissingArgumentError('_namespace is required');

    this._lockHolder = lockHolder;
    this._namespace = namespace;

    if (!leaseName) {
      this._leaseName = this._namespace.name;
    }

    // In most production cases, the environment variable should be preferred over the constructor argument.
    if (!durationSeconds) {
      this._durationSeconds = +process.env.SOLO_LEASE_DURATION || IntervalLock.DEFAULT_LEASE_DURATION;
    } else {
      this._durationSeconds = durationSeconds;
    }
  }

  /**
   * The name of the lease.
   */
  get leaseName(): string {
    return this._leaseName;
  }

  /**
   * The holder of the lock.
   */
  get lockHolder(): LockHolder {
    return this._lockHolder;
  }

  /**
   * The namespace in which the lease is to be acquired. By default, the namespace is used as the lease name.
   * The defaults assume there is only a single deployment in a given namespace.
   */
  get namespace(): NamespaceName {
    return this._namespace;
  }

  /**
   * The duration in seconds for which the lease is held before being considered expired. By default, the duration
   * is set to 20 seconds. It is recommended to renew the lease at 50% of the duration to prevent unexpected expiration.
   */
  get durationSeconds(): number {
    return this._durationSeconds;
  }

  /**
   * The identifier of the scheduled lease renewal task.
   */
  get scheduleId(): number | null {
    return this._scheduleId;
  }

  /**
   * Internal setter for the scheduleId property. External callers should not use this method.
   *
   * @param scheduleId - The identifier of the scheduled lease renewal task.
   */
  private set scheduleId(scheduleId: number | null) {
    this._scheduleId = scheduleId;
  }

  /**
   * Acquires the lock. If the lock is already acquired, it checks if the lock is expired or held by the same process.
   * If the lock is expired, it creates a new lock. If the lock is held by the same process, it renews the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @throws LockAcquisitionError - If the lock is already acquired by another process or an error occurs during acquisition.
   */
  async acquire(): Promise<void> {
    let lease: Lease;
    try {
      lease = await this.retrieveLease();
    } catch (e) {
      throw new LockAcquisitionError(
        `failed to read during acquire, the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${e.message}`,
        e,
      );
    }

    if (!lease || this.heldBySameProcess(lease)) {
      try {
        return await this.createOrRenewLease(lease);
      } catch (e) {
        throw new LockAcquisitionError(
          `failed to create or renew during acquire, the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace`,
          e,
        );
      }
    } else if (IntervalLock.checkExpiration(lease)) {
      try {
        return await this.transferLease(lease);
      } catch (e) {
        throw new LockAcquisitionError(
          `failed to transfer during acquire, the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace`,
          e,
        );
      }
    }

    const otherHolder: LockHolder = LockHolder.fromJson(lease.holderIdentity);

    if (this.heldBySameMachineIdentity(lease) && !otherHolder.isProcessAlive()) {
      try {
        return await this.transferLease(lease);
      } catch (e) {
        throw new LockAcquisitionError(
          `failed to transfer during acquire, the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace, other holder: '${otherHolder.username}'`,
          e,
        );
      }
    }

    throw new LockAcquisitionError(
      `acquire: lock already acquired by '${otherHolder.username}' on the ` +
        `'${otherHolder.hostname}' machine (PID: '${otherHolder.processId}')`,
      null,
      {self: this.lockHolder.toObject(), other: otherHolder.toObject()},
    );
  }

  /**
   * Attempts to acquire the lock, by calling the acquire method. If an exception is thrown, it is caught and false is returned.
   * If the lock is successfully acquired, true is returned; otherwise, false is returned.
   *
   * @returns true if the lock is successfully acquired; otherwise, false.
   */
  async tryAcquire(): Promise<boolean> {
    try {
      await this.acquire();
      return true;
    } catch (e: SoloError | any) {
      return false;
    }
  }

  /**
   * Renews the lock. If the lock is expired or held by the same process, it creates or renews the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @throws LockAcquisitionError - If the lock is already acquired by another process or an error occurs during renewal.
   */
  async renew(): Promise<void> {
    let lease: Lease;
    try {
      lease = await this.retrieveLease();
    } catch (e) {
      throw new LockAcquisitionError(
        `failed to read the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${e.message}`,
        e,
      );
    }

    if (!lease || this.heldBySameProcess(lease)) {
      try {
        return await this.createOrRenewLease(lease);
      } catch (e) {
        throw new LockAcquisitionError(
          `failed to create or renew the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
          e,
        );
      }
    }

    throw new LockAcquisitionError(
      `renew: lock already acquired by '${this._lockHolder.username}' on the ` +
        `'${this._lockHolder.hostname}' machine (PID: '${this._lockHolder.processId}')`,
      null,
      {self: this._lockHolder.toObject(), other: this._lockHolder.toObject()},
    );
  }

  /**
   * Attempts to renew the lock, by calling the renew method. If an exception is thrown, it is caught and false is returned.
   * If the lock is successfully renewed, true is returned; otherwise, false is returned.
   *
   * @returns true if the lock is successfully renewed; otherwise, false.
   */
  async tryRenew(): Promise<boolean> {
    try {
      await this.renew();
      return true;
    } catch (e) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).error(`tryRenew failed: ${e.message}`, e);
      return false;
    }
  }

  /**
   * Releases the lock. If the lock is expired or held by the same process, it deletes the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @throws LockRelinquishmentError - If the lock is already acquired by another process or an error occurs during relinquishment.
   */
  async release(): Promise<void> {
    let lease: Lease;
    try {
      lease = await this.retrieveLease();
    } catch (e) {
      throw new LockAcquisitionError(
        `during release, failed to read the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${e.message}`,
        e,
      );
    }

    if (this.scheduleId) {
      await this.renewalService.cancel(this.scheduleId);
      // Needed to ensure any pending renewals are truly cancelled before proceeding to delete the LeaseService.
      // This is required because clearInterval() is not guaranteed to abort any pending interval.
      await sleep(this.renewalService.calculateRenewalDelay(this));
    }

    this.scheduleId = null;

    if (!lease) {
      return;
    }

    const otherHolder: LockHolder = LockHolder.fromJson(lease.holderIdentity);

    if (this.heldBySameProcess(lease) || IntervalLock.checkExpiration(lease)) {
      return await this.deleteLease();
    }

    throw new LockRelinquishmentError(
      `release: lock already acquired by '${otherHolder.username}' on the ` +
        `'${otherHolder.hostname}' machine (PID: '${otherHolder.processId}')`,
      null,
      {self: this._lockHolder.toObject(), other: otherHolder.toObject()},
    );
  }

  /**
   * Attempts to release the lock, by calling the release method. If an exception is thrown, it is caught and false is returned.
   * If the lock is successfully released, true is returned; otherwise, false is returned.
   *
   * @returns true if the lock is successfully released; otherwise, false.
   */
  async tryRelease(): Promise<boolean> {
    try {
      await this.release();
      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return false;
    }
  }

  /**
   * Checks if the lock is acquired. If the lock is acquired and not expired, it returns true; otherwise, false.
   *
   * @returns true if the lock is acquired and not expired; otherwise, false.
   */
  async isAcquired(): Promise<boolean> {
    const lease = await this.retrieveLease();
    return !!lease && !IntervalLock.checkExpiration(lease) && this.heldBySameProcess(lease);
  }

  /**
   * Checks if the lock is expired. If the lock is expired, it returns true; otherwise, false.
   * This method does not verify if the lock is acquired by the current process.
   *
   * @returns true if the lock is expired; otherwise, false.
   */
  async isExpired(): Promise<boolean> {
    const lease = await this.retrieveLease();
    return !!lease && IntervalLock.checkExpiration(lease);
  }

  /**
   * Retrieves the lease from the Kubernetes API server.
   *
   * @returns the Kubernetes lease object if it exists; otherwise, null.
   * @throws LockAcquisitionError - If an error occurs during retrieval.
   */
  private async retrieveLease(): Promise<Lease> {
    try {
      return await this.k8Factory.default().leases().read(this.namespace, this.leaseName);
    } catch (e: any) {
      if (!(e instanceof SoloError)) {
        throw new LockAcquisitionError(
          `failed to read the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace, caused by: ${e.message}`,
          e,
        );
      }

      if (e.statusCode !== StatusCodes.NOT_FOUND) {
        throw new LockAcquisitionError(
          'failed to read existing leases, unexpected server response of ' + `'${e.meta.statusCode}' received`,
          e,
        );
      }
    }

    return null;
  }

  /**
   * Creates or renews the lease. If the lease does not exist, it creates a new lease. If the lease exists, it renews the lease.
   *
   * @param lease - The lease to be created or renewed.
   */
  private async createOrRenewLease(lease: Lease): Promise<void> {
    try {
      if (!lease) {
        await this.k8Factory
          .default()
          .leases()
          .create(this.namespace, this.leaseName, this.lockHolder.toJson(), this.durationSeconds);
      } else {
        await this.k8Factory.default().leases().renew(this.namespace, this.leaseName, lease);
      }

      if (!this.scheduleId) {
        this.scheduleId = await this.renewalService.schedule(this);
      }
    } catch (e) {
      throw new LockAcquisitionError(
        `failed to create or renew the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
        e,
      );
    }
  }

  /**
   * Transfers an existing (expired) lease to the current process.
   *
   * @param lease - The lease to be transferred.
   */
  private async transferLease(lease: Lease): Promise<void> {
    try {
      await this.k8Factory.default().leases().transfer(lease, this.lockHolder.toJson());

      if (!this.scheduleId) {
        this.scheduleId = await this.renewalService.schedule(this);
      }
    } catch (e) {
      throw new LockAcquisitionError(
        `failed to transfer the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
        e,
      );
    }
  }

  /**
   * Deletes the lease from the Kubernetes API server.
   */
  private async deleteLease(): Promise<void> {
    try {
      await this.k8Factory.default().leases().delete(this.namespace, this.leaseName);
    } catch (e) {
      throw new LockRelinquishmentError(
        `failed to delete the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
        e,
      );
    }
  }

  /**
   * Determines if the lease has expired by comparing the delta in seconds between the current time and the last renewal time.
   *
   * @param lease - The lease to be checked for expiration.
   * @returns true if the lease has expired; otherwise, false.
   */
  private static checkExpiration(lease: Lease): boolean {
    const now = Duration.ofMillis(Date.now());
    const durationSec = lease.durationSeconds || IntervalLock.DEFAULT_LEASE_DURATION;
    const lastRenewalTime = lease.renewTime || lease.acquireTime;
    const lastRenewal = Duration.ofMillis(new Date(lastRenewalTime).valueOf());
    const deltaSec = now.minus(lastRenewal).seconds;
    return deltaSec > durationSec;
  }

  /**
   * Determines if the lock is held by the same process. This comparison is based on the user, machine, and
   * process identifier of the leaseholder.
   *
   * @param lease - The lease to be checked for ownership.
   * @returns true if the lease is held by the same process; otherwise, false.
   */
  private heldBySameProcess(lease: Lease): boolean {
    const holder: LockHolder = LockHolder.fromJson(lease.holderIdentity);
    return this.lockHolder.equals(holder);
  }

  /**
   * Determines if the lock is held by the same machine identity. This comparison is based on the user and machine only.
   * The process identifier is not considered in this comparison.
   *
   * @param lease - The lease to be checked for ownership.
   * @returns true if the lease is held by the same user and machine; otherwise, false.
   */
  private heldBySameMachineIdentity(lease: Lease): boolean {
    const holder: LockHolder = LockHolder.fromJson(lease.holderIdentity);
    return this.lockHolder.isSameMachineIdentity(holder);
  }
}
