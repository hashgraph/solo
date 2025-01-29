/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Flags as flags} from '../../commands/flags.js';
import {ConfigManager} from '../config_manager.js';
import {K8} from '../k8.js';
import {SoloLogger} from '../logging.js';
import {type Lease, type LeaseRenewalService} from './lease.js';
import {IntervalLease} from './interval_lease.js';
import {LeaseHolder} from './lease_holder.js';
import {LeaseAcquisitionError} from './lease_errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../container_helper.js';

/**
 * Manages the acquisition and renewal of leases.
 */
@injectable()
export class LeaseManager {
  /**
   * Creates a new lease manager.
   *
   * @param _renewalService - the lease renewal service.
   * @param _logger - the logger.
   * @param k8 - the Kubernetes client.
   * @param configManager - the configuration manager.
   */
  constructor(
    @inject('LeaseRenewalService') private readonly _renewalService?: LeaseRenewalService,
    @inject(SoloLogger) private readonly _logger?: SoloLogger,
    @inject(K8) private readonly k8?: K8,
    @inject(ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this._renewalService = patchInject(_renewalService, 'LeaseRenewalService', this.constructor.name);
    this._logger = patchInject(_logger, SoloLogger, this.constructor.name);
    this.k8 = patchInject(k8, K8, this.constructor.name);
    this.configManager = patchInject(configManager, ConfigManager, this.constructor.name);
  }

  /**
   * Creates a new lease. This lease is not acquired until the `acquire` method is called.
   *
   * @returns a new lease instance.
   */
  public async create(): Promise<Lease> {
    return new IntervalLease(this.k8, this._renewalService, LeaseHolder.default(), await this.currentNamespace());
  }

  /**
   * Retrieves the renewal service implementation.
   *
   * @returns the lease renewal service.
   */
  public get renewalService(): LeaseRenewalService {
    return this._renewalService;
  }

  /**
   * Retrieves the logger instance.
   *
   * @returns the logger.
   */
  public get logger(): SoloLogger {
    return this._logger;
  }

  /**
   * Retrieves the user or configuration supplied namespace to use for lease acquisition.
   *
   * @returns the namespace to use for lease acquisition or null if no namespace is specified.
   * @throws LeaseAcquisitionError if the namespace does not exist and cannot be created.
   */
  private async currentNamespace(): Promise<string> {
    const deploymentNamespace = this.configManager.getFlag<string>(flags.namespace);
    const clusterSetupNamespace = this.configManager.getFlag<string>(flags.clusterSetupNamespace);

    if (!deploymentNamespace && !clusterSetupNamespace) {
      return null;
    }
    const namespace = deploymentNamespace ? deploymentNamespace : clusterSetupNamespace;

    if (!(await this.k8.hasNamespace(namespace))) {
      await this.k8.createNamespace(namespace);

      if (!(await this.k8.hasNamespace(namespace))) {
        throw new LeaseAcquisitionError(`failed to create the '${namespace}' namespace`);
      }
    }

    return namespace;
  }
}
