/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {Flags as flags} from '../../commands/flags.js';
import {type ConfigManager} from '../config_manager.js';
import {type K8Factory} from '../kube/k8_factory.js';
import {type SoloLogger} from '../logging.js';
import {type Lease, type LeaseRenewalService} from './lease.js';
import {IntervalLease} from './interval_lease.js';
import {LeaseHolder} from './lease_holder.js';
import {LeaseAcquisitionError} from './lease_errors.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency_injection/container_helper.js';
import {type NamespaceName} from '../kube/resources/namespace/namespace_name.js';
import {InjectTokens} from '../dependency_injection/inject_tokens.js';

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
   * @param k8Factory - the Kubernetes client.
   * @param configManager - the configuration manager.
   */
  constructor(
    @inject(InjectTokens.LeaseRenewalService) private readonly _renewalService?: LeaseRenewalService,
    @inject(InjectTokens.SoloLogger) private readonly _logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this._renewalService = patchInject(_renewalService, InjectTokens.LeaseRenewalService, this.constructor.name);
    this._logger = patchInject(_logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
  }

  /**
   * Creates a new lease. This lease is not acquired until the `acquire` method is called.
   *
   * @returns a new lease instance.
   */
  public async create(): Promise<Lease> {
    return new IntervalLease(
      this.k8Factory,
      this._renewalService,
      LeaseHolder.default(),
      await this.currentNamespace(),
    );
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
  private async currentNamespace(): Promise<NamespaceName> {
    const deploymentNamespace = this.configManager.getFlag<NamespaceName>(flags.namespace);
    const clusterSetupNamespace = this.configManager.getFlag<NamespaceName>(flags.clusterSetupNamespace);

    if (!deploymentNamespace && !clusterSetupNamespace) {
      return null;
    }
    const namespace = deploymentNamespace ? deploymentNamespace : clusterSetupNamespace;

    if (!(await this.k8Factory.default().namespaces().has(namespace))) {
      await this.k8Factory.default().namespaces().create(namespace);

      if (!(await this.k8Factory.default().namespaces().has(namespace))) {
        throw new LeaseAcquisitionError(`failed to create the '${namespace}' namespace`);
      }
    }

    return namespace;
  }
}
