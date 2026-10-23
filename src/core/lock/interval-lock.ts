// SPDX-License-Identifier: Apache-2.0

import {SoloErrors} from '../errors/solo-errors.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type K8} from '../../integration/kube/k8.js';
import {type Context} from '../../types/index.js';
import {LockHolder} from './lock-holder.js';
import {DEFAULT_LEASE_DURATION, DEFAULT_SOLO_NAMESPACE_LABELS} from '../constants.js';
import {sleep} from '../helpers.js';
import {Duration} from '../time/duration.js';
import {type Lock} from './lock.js';
import {type LockRenewalService} from './lock-renewal-service.js';
import {StatusCodes} from 'http-status-codes';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {type Lease} from '../../integration/kube/resources/lease/lease.js';
import {LockAcquisitionError} from './lock-acquisition-error.js';
import {LockRelinquishmentError} from './lock-relinquishment-error.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
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
  /** The holder of the lock. */
  private readonly _lockHolder: LockHolder;

  /** The namespace which contains the lease. */
  private readonly _namespace: NamespaceName;

  /** The name of the lease. */
  private readonly _leaseName: string;

  /** The kube context of the cluster which holds the lease. */
  private readonly _context: Context;

  /** The duration in seconds for which the lease is to be held. */
  private readonly _durationSeconds: number;

  /** The identifier of the scheduled lease renewal. */
  private _scheduleId: number | null = undefined;

  /**
   * @param k8Factory - Injected kubernetes K8Factory need by the methods to create, renew, and delete leases.
   * @param renewalService - Injected lock renewal service need to support automatic (background) lock renewals.
   * @param lockHolder - The holder of the lock.
   * @param namespace - The namespace in which the lease is to be acquired.
   * @param leaseName - The name of the lease to be acquired; if not provided, the namespace is used.
   * @param durationSeconds - The duration in seconds for which the lock is to be held; if not provided, the default value is used.
   * @param context - The kube context of the cluster which holds the lease; if not provided, the kube current context is used.
   */
  public constructor(
    readonly k8Factory: K8Factory,
    readonly renewalService: LockRenewalService,
    lockHolder: LockHolder,
    namespace: NamespaceName,
    leaseName: string | null = null,
    durationSeconds: number | null = null,
    context: Context | null = null,
  ) {
    if (!k8Factory) {
      throw new SoloErrors.validation.missingArgument('k8Factory is required');
    }
    if (!renewalService) {
      throw new SoloErrors.validation.missingArgument('renewalService is required');
    }
    if (!lockHolder) {
      throw new SoloErrors.validation.missingArgument('_lockHolder is required');
    }
    if (!namespace) {
      throw new SoloErrors.validation.missingArgument('_namespace is required');
    }

    this._lockHolder = lockHolder;
    this._namespace = namespace;
    // Pin the cluster once, so acquire, renew and release always use the same cluster,
    // even when the kube current context changes while the lock is held.
    this._context = context ?? k8Factory.default().contexts().readCurrent();

    if (!leaseName) {
      this._leaseName = this._namespace.name;
    }

    // In most production cases, the environment variable should be preferred over the constructor argument.
    this._durationSeconds = durationSeconds ?? DEFAULT_LEASE_DURATION;
  }

  /**
   * The name of the lease.
   */
  public get leaseName(): string {
    return this._leaseName;
  }

  /**
   * The kube context of the cluster which holds the lease.
   */
  public get context(): Context {
    return this._context;
  }

  /**
   * The holder of the lock.
   */
  public get lockHolder(): LockHolder {
    return this._lockHolder;
  }

  /**
   * The namespace in which the lease is to be acquired. By default, the namespace is used as the lease name.
   * The defaults assume there is only a single deployment in a given namespace.
   */
  public get namespace(): NamespaceName {
    return this._namespace;
  }

  /**
   * The duration in seconds for which the lease is held before being considered expired. By default, the duration
   * is set to 20 seconds. It is recommended to renew the lease at 50% of the duration to prevent unexpected expiration.
   */
  public get durationSeconds(): number {
    return this._durationSeconds;
  }

  /**
   * The identifier of the scheduled lease renewal task.
   */
  public get scheduleId(): number | null {
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
    } catch (error) {
      throw new LockAcquisitionError(
        `failed to read during acquire, the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${error.message}`,
        error,
      );
    }

    if (!lease || this.heldBySameProcess(lease)) {
      try {
        return await this.createOrRenewLease(lease);
      } catch (error) {
        throw new LockAcquisitionError(
          `failed to create or renew during acquire, the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace`,
          error,
        );
      }
    } else if (IntervalLock.checkExpiration(lease)) {
      try {
        return await this.transferLease(lease);
      } catch (error) {
        throw new LockAcquisitionError(
          `failed to transfer during acquire, the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace`,
          error,
        );
      }
    }

    const otherHolder: LockHolder = LockHolder.fromJson(lease.holderIdentity);

    if (this.heldBySameMachineIdentity(lease) && otherHolder.isProcessLost()) {
      try {
        return await this.transferLease(lease);
      } catch (error) {
        throw new LockAcquisitionError(
          `failed to transfer during acquire, the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace, other holder: '${otherHolder.username}'`,
          error,
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
    } catch {
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
    } catch (error) {
      throw new LockAcquisitionError(
        `failed to read the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${error.message}`,
        error,
      );
    }

    if (!lease || this.heldBySameProcess(lease)) {
      try {
        return await this.createOrRenewLease(lease);
      } catch (error) {
        throw new LockAcquisitionError(
          `failed to create or renew the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
          error,
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
    } catch (error) {
      container.resolve<SoloLogger>(InjectTokens.SoloLogger).error(`tryRenew failed: ${error.message}`, error);
      return false;
    }
  }

  /**
   * Releases the lock. If the lock is expired or held by the same process, it deletes the lock.
   * If the lock is held by another process, then an exception is thrown.
   *
   * @param immediate - If true, the safe sleep period is skipped
   * @throws LockRelinquishmentError - If the lock is already acquired by another process or an error occurs during relinquishment.
   */
  async release(immediate: boolean = false): Promise<void> {
    let lease: Lease;
    try {
      lease = await this.retrieveLease();
    } catch (error) {
      throw new LockAcquisitionError(
        `during release, failed to read the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${error.message}`,
        error,
      );
    }

    if (this.scheduleId) {
      await this.renewalService.cancel(this.scheduleId);
      if (!immediate) {
        // Needed to ensure any pending renewals are truly cancelled before proceeding to delete the LeaseService.
        // This is required because clearInterval() is not guaranteed to abort any pending interval.
        await sleep(this.renewalService.calculateRenewalDelay(this));
      }
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
    } catch {
      return false;
    }
  }

  /**
   * Checks if the lock is acquired. If the lock is acquired and not expired, it returns true; otherwise, false.
   *
   * @returns true if the lock is acquired and not expired; otherwise, false.
   */
  async isAcquired(): Promise<boolean> {
    const lease: Lease | undefined = await this.retrieveLease();
    return !!lease && !IntervalLock.checkExpiration(lease) && this.heldBySameProcess(lease);
  }

  /**
   * Checks if the lock is expired. If the lock is expired, it returns true; otherwise, false.
   * This method does not verify if the lock is acquired by the current process.
   *
   * @returns true if the lock is expired; otherwise, false.
   */
  async isExpired(): Promise<boolean> {
    const lease: Lease | undefined = await this.retrieveLease();
    return !!lease && IntervalLock.checkExpiration(lease);
  }

  /**
   * The client for the cluster which holds the lease.
   */
  private k8(): K8 {
    return this.k8Factory.getK8(this._context);
  }

  /**
   * Retrieves the lease from the Kubernetes API server.
   *
   * @returns the Kubernetes lease object if it exists; otherwise, null.
   * @throws LockAcquisitionError - If an error occurs during retrieval.
   */
  private async retrieveLease(): Promise<Lease> {
    try {
      return await this.k8().leases().read(this.namespace, this.leaseName);
    } catch (error) {
      if (IntervalLock.hasStatusCode(error, StatusCodes.NOT_FOUND)) {
        return null;
      }
      throw new LockAcquisitionError(
        `failed to read the lease named '${this.leaseName}' in the ` +
          `'${this.namespace}' namespace, caused by: ${error.message}`,
        error,
      );
    }
  }

  /**
   * Creates or renews the lease. If the lease does not exist, it creates a new lease. If the lease exists, it renews the lease.
   *
   * @param lease - The lease to be created or renewed.
   */
  private async createOrRenewLease(lease: Lease): Promise<void> {
    try {
      if (!(await this.k8().namespaces().has(this.namespace))) {
        // handles the condition for creating a lease on cluster setup which may not have a namespace created yet
        await this.k8().namespaces().create(this.namespace, DEFAULT_SOLO_NAMESPACE_LABELS);
      }
      if (lease) {
        try {
          await this.k8().leases().renew(this.namespace, this.leaseName, lease);
        } catch (error) {
          if (!(await this.shouldIgnoreRenewConflict(error))) {
            throw error;
          }
        }
      } else {
        await this.k8().leases().create(this.namespace, this.leaseName, this.lockHolder.toJson(), this.durationSeconds);
      }

      if (!this.scheduleId) {
        this.scheduleId = await this.renewalService.schedule(this);
      }
    } catch (error) {
      if (this.scheduleId && IntervalLock.hasStatusCode(error, StatusCodes.FORBIDDEN)) {
        // A 403 during renewal most likely means the namespace is being terminated.
        // Cancel the renewal schedule and return gracefully instead of propagating the error.
        container
          .resolve<SoloLogger>(InjectTokens.SoloLogger)
          .info(
            `lease '${this.leaseName}' renewal forbidden in namespace '${this.namespace}'; namespace may be terminating, stopping renewal`,
          );
        await this.renewalService.cancel(this.scheduleId);
        this.scheduleId = null;
        return;
      }
      throw new LockAcquisitionError(
        `failed to create or renew the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
        error,
      );
    }
  }

  /**
   * Determines if a renew conflict can be safely ignored.
   *
   * @param error - the renew error to evaluate.
   * @returns true if the conflict should be ignored; otherwise, false.
   */
  private async shouldIgnoreRenewConflict(error: unknown): Promise<boolean> {
    if (!IntervalLock.hasStatusCode(error, StatusCodes.CONFLICT)) {
      return false;
    }

    const latestLease: Lease = await this.retrieveLease();
    return !!latestLease && this.heldBySameProcess(latestLease);
  }

  /**
   * Determines whether an error or any nested cause contains the specified status code.
   *
   * @param error - the error to inspect.
   * @param statusCode - the status code to match.
   * @returns true if the status code is found in the error chain; otherwise, false.
   */
  private static hasStatusCode(error: unknown, statusCode: number): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const typedError: {
      statusCode?: number;
      code?: number;
      meta?: {
        statusCode?: number;
      };
      cause?: unknown;
    } = error;

    return (
      typedError.statusCode === statusCode ||
      typedError.code === statusCode ||
      typedError.meta?.statusCode === statusCode ||
      IntervalLock.hasStatusCode(typedError.cause, statusCode)
    );
  }

  /**
   * Transfers an existing (expired) lease to the current process.
   *
   * @param lease - The lease to be transferred.
   */
  private async transferLease(lease: Lease): Promise<void> {
    try {
      await this.k8().leases().transfer(lease, this.lockHolder.toJson());

      if (!this.scheduleId) {
        this.scheduleId = await this.renewalService.schedule(this);
      }
    } catch (error) {
      throw new LockAcquisitionError(
        `failed to transfer the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
        error,
      );
    }
  }

  /**
   * Deletes the lease from the Kubernetes API server.
   */
  private async deleteLease(): Promise<void> {
    try {
      await this.k8().leases().delete(this.namespace, this.leaseName);
    } catch (error) {
      throw new LockRelinquishmentError(
        `failed to delete the lease named '${this.leaseName}' in the ` + `'${this.namespace}' namespace`,
        error,
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
    const now: Duration = Duration.ofMillis(Date.now());
    const durationSec: number = lease.durationSeconds || DEFAULT_LEASE_DURATION;
    const lastRenewalTime: Date = new Date(lease.renewTime || lease.acquireTime);
    const lastRenewal: Duration = Duration.ofMillis(new Date(lastRenewalTime).valueOf());
    const deltaSec: number = now.minus(lastRenewal).seconds;
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
