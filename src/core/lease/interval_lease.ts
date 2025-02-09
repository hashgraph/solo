/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {MissingArgumentError, SoloError} from '../errors.js';
import {type V1Lease} from '@kubernetes/client-node';
import {type K8} from '../../core/kube/k8.js';
import {LeaseHolder} from './lease_holder.js';
import {LeaseAcquisitionError, LeaseRelinquishmentError} from './lease_errors.js';
import {sleep} from '../helpers.js';
import {Duration} from '../time/duration.js';
import {type Lease, type LeaseRenewalService} from './lease.js';
import {StatusCodes} from 'http-status-codes';
import {type NamespaceName} from '../kube/resources/namespace/namespace_name.js';

/**
 * Concrete implementation of a Kubernetes based time-based mutually exclusive lock via the Coordination API.
 * Applies a namespace/deployment wide lock to ensure that only one process, machine, and user can hold the lease at a time.
 * The lease is automatically renewed in the background to prevent expiration and ensure the holder maintains the lease.
 * If the process die, the lease is automatically released after the lease duration.
 *
 * @public
 */
export class IntervalLease implements Lease {
  /** The default duration in seconds for which the lease is to be held before being considered expired. */
  public static readonly DEFAULT_LEASE_DURATION = 20;

  /** The holder of the lease. */
  private readonly _leaseHolder: LeaseHolder;

  /** The namespace which contains the lease. */
  private readonly _namespace: NamespaceName;

  /** The name of the lease. */
  private readonly _leaseName: string;

  /** The duration in seconds for which the lease is to be held. */
  private readonly _durationSeconds: number;

  /** The identifier of the scheduled lease renewal. */
  private _scheduleId: number | null = null;

  /**
   * @param client - Injected kubernetes client need by the methods to create, renew, and delete leases.
   * @param renewalService - Injected lease renewal service need to support automatic (background) lease renewals.
   * @param leaseHolder - The holder of the lease.
   * @param namespace - The namespace in which the lease is to be acquired.
   * @param leaseName - The name of the lease to be acquired; if not provided, the namespace is used.
   * @param durationSeconds - The duration in seconds for which the lease is to be held; if not provided, the default value is used.
   */
  public constructor(
    readonly client: K8,
    readonly renewalService: LeaseRenewalService,
    leaseHolder: LeaseHolder,
    namespace: NamespaceName,
    leaseName: string | null = null,
    durationSeconds: number | null = null,
  ) {
    if (!client) throw new MissingArgumentError('client is required');
    if (!renewalService) throw new MissingArgumentError('renewalService is required');
    if (!leaseHolder) throw new MissingArgumentError('_leaseHolder is required');
    if (!namespace) throw new MissingArgumentError('_namespace is required');

    this._leaseHolder = leaseHolder;
    this._namespace = namespace;

    if (!leaseName) {
      this._leaseName = this._namespace.name;
    }

    // In most production cases, the environment variable should be preferred over the constructor argument.
    if (!durationSeconds) {
      this._durationSeconds = +process.env.SOLO_LEASE_DURATION || IntervalLease.DEFAULT_LEASE_DURATION;
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
   * The holder of the lease.
   */
  get leaseHolder(): LeaseHolder {
    return this._leaseHolder;
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
   * Acquires the lease. If the lease is already acquired, it checks if the lease is expired or held by the same process.
   * If the lease is expired, it creates a new lease. If the lease is held by the same process, it renews the lease.
   * If the lease is held by another process, then an exception is thrown.
   *
   * @throws LeaseAcquisitionError - If the lease is already acquired by another process or an error occurs during acquisition.
   */
  async acquire(): Promise<void> {
    const lease = await this.retrieveLease();

    if (!lease || this.heldBySameProcess(lease)) {
      return this.createOrRenewLease(lease);
    } else if (IntervalLease.checkExpiration(lease)) {
      return this.transferLease(lease);
    }

    const otherHolder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity);

    if (this.heldBySameMachineIdentity(lease) && !otherHolder.isProcessAlive()) {
      return this.transferLease(lease);
    }

    throw new LeaseAcquisitionError(
      `acquire: lease already acquired by '${otherHolder.username}' on the ` +
        `'${otherHolder.hostname}' machine (PID: '${otherHolder.processId}')`,
      null,
      {self: this.leaseHolder.toObject(), other: otherHolder.toObject()},
    );
  }

  /**
   * Attempts to acquire the lease, by calling the acquire method. If an exception is thrown, it is caught and false is returned.
   * If the lease is successfully acquired, true is returned; otherwise, false is returned.
   *
   * @returns true if the lease is successfully acquired; otherwise, false.
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
   * Renews the lease. If the lease is expired or held by the same process, it creates or renews the lease.
   * If the lease is held by another process, then an exception is thrown.
   *
   * @throws LeaseAcquisitionError - If the lease is already acquired by another process or an error occurs during renewal.
   */
  async renew(): Promise<void> {
    const lease = await this.retrieveLease();

    if (!lease || this.heldBySameProcess(lease)) {
      return await this.createOrRenewLease(lease);
    }

    throw new LeaseAcquisitionError(
      `renew: lease already acquired by '${this._leaseHolder.username}' on the ` +
        `'${this._leaseHolder.hostname}' machine (PID: '${this._leaseHolder.processId}')`,
      null,
      {self: this._leaseHolder.toObject(), other: this._leaseHolder.toObject()},
    );
  }

  /**
   * Attempts to renew the lease, by calling the renew method. If an exception is thrown, it is caught and false is returned.
   * If the lease is successfully renewed, true is returned; otherwise, false is returned.
   *
   * @returns true if the lease is successfully renewed; otherwise, false.
   */
  async tryRenew(): Promise<boolean> {
    try {
      await this.renew();
      return true;
    } catch (e: SoloError | any) {
      return false;
    }
  }

  /**
   * Releases the lease. If the lease is expired or held by the same process, it deletes the lease.
   * If the lease is held by another process, then an exception is thrown.
   *
   * @throws LeaseRelinquishmentError - If the lease is already acquired by another process or an error occurs during relinquishment.
   */
  async release(): Promise<void> {
    const lease = await this.retrieveLease();

    if (this.scheduleId) {
      await this.renewalService.cancel(this.scheduleId);
      // Needed to ensure any pending renewals are truly cancelled before proceeding to delete the Lease.
      // This is required because clearInterval() is not guaranteed to abort any pending interval.
      await sleep(this.renewalService.calculateRenewalDelay(this));
    }

    this.scheduleId = null;

    if (!lease) {
      return;
    }

    const otherHolder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity);

    if (this.heldBySameProcess(lease) || IntervalLease.checkExpiration(lease)) {
      return await this.deleteLease();
    }

    throw new LeaseRelinquishmentError(
      `release: lease already acquired by '${otherHolder.username}' on the ` +
        `'${otherHolder.hostname}' machine (PID: '${otherHolder.processId}')`,
      null,
      {self: this._leaseHolder.toObject(), other: otherHolder.toObject()},
    );
  }

  /**
   * Attempts to release the lease, by calling the release method. If an exception is thrown, it is caught and false is returned.
   * If the lease is successfully released, true is returned; otherwise, false is returned.
   *
   * @returns true if the lease is successfully released; otherwise, false.
   */
  async tryRelease(): Promise<boolean> {
    try {
      await this.release();
      return true;
    } catch (e: SoloError | any) {
      return false;
    }
  }

  /**
   * Checks if the lease is acquired. If the lease is acquired and not expired, it returns true; otherwise, false.
   *
   * @returns true if the lease is acquired and not expired; otherwise, false.
   */
  async isAcquired(): Promise<boolean> {
    const lease = await this.retrieveLease();
    return !!lease && !IntervalLease.checkExpiration(lease) && this.heldBySameProcess(lease);
  }

  /**
   * Checks if the lease is expired. If the lease is expired, it returns true; otherwise, false.
   * This method does not verify if the lease is acquired by the current process.
   *
   * @returns true if the lease is expired; otherwise, false.
   */
  async isExpired(): Promise<boolean> {
    const lease = await this.retrieveLease();
    return !!lease && IntervalLease.checkExpiration(lease);
  }

  /**
   * Retrieves the lease from the Kubernetes API server.
   *
   * @returns the Kubernetes lease object if it exists; otherwise, null.
   * @throws LeaseAcquisitionError - If an error occurs during retrieval.
   */
  private async retrieveLease(): Promise<V1Lease> {
    try {
      return await this.client.leases().read(this.namespace, this.leaseName);
    } catch (e: any) {
      if (!(e instanceof SoloError)) {
        throw new LeaseAcquisitionError(
          `failed to read the lease named '${this.leaseName}' in the ` +
            `'${this.namespace}' namespace, caused by: ${e.message}`,
          e,
        );
      }

      if (e.meta.statusCode !== StatusCodes.NOT_FOUND) {
        throw new LeaseAcquisitionError(
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
  private async createOrRenewLease(lease: V1Lease): Promise<void> {
    try {
      if (!lease) {
        await this.client
          .leases()
          .create(this.namespace, this.leaseName, this.leaseHolder.toJson(), this.durationSeconds);
      } else {
        await this.client.leases().renew(this.namespace, this.leaseName, lease);
      }

      if (!this.scheduleId) {
        this.scheduleId = await this.renewalService.schedule(this);
      }
    } catch (e: any) {
      throw new LeaseAcquisitionError(
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
  private async transferLease(lease: V1Lease): Promise<void> {
    try {
      await this.client.leases().transfer(lease, this.leaseHolder.toJson());

      if (!this.scheduleId) {
        this.scheduleId = await this.renewalService.schedule(this);
      }
    } catch (e: any) {
      throw new LeaseAcquisitionError(
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
      await this.client.leases().delete(this.namespace, this.leaseName);
    } catch (e: any) {
      throw new LeaseRelinquishmentError(
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
  private static checkExpiration(lease: V1Lease): boolean {
    const now = Duration.ofMillis(Date.now());
    const durationSec = lease.spec.leaseDurationSeconds || IntervalLease.DEFAULT_LEASE_DURATION;
    const lastRenewalTime = lease.spec?.renewTime || lease.spec?.acquireTime;
    const lastRenewal = Duration.ofMillis(new Date(lastRenewalTime).valueOf());
    const deltaSec = now.minus(lastRenewal).seconds;
    return deltaSec > durationSec;
  }

  /**
   * Determines if the lease is held by the same process. This comparison is based on the user, machine, and
   * process identifier of the leaseholder.
   *
   * @param lease - The lease to be checked for ownership.
   * @returns true if the lease is held by the same process; otherwise, false.
   */
  private heldBySameProcess(lease: V1Lease): boolean {
    const holder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity);
    return this.leaseHolder.equals(holder);
  }

  /**
   * Determines if the lease is held by the same machine identity. This comparison is based on the user and machine only.
   * The process identifier is not considered in this comparison.
   *
   * @param lease - The lease to be checked for ownership.
   * @returns true if the lease is held by the same user and machine; otherwise, false.
   */
  private heldBySameMachineIdentity(lease: V1Lease): boolean {
    const holder: LeaseHolder = LeaseHolder.fromJson(lease.spec.holderIdentity);
    return this.leaseHolder.isSameMachineIdentity(holder);
  }
}
