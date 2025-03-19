// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../../commands/flags.js';
import {type ConfigManager} from '../config-manager.js';
import {type K8Factory} from '../kube/k8-factory.js';
import {type SoloLogger} from '../logging.js';
import {type Lock, type LockRenewalService} from './lock.js';
import {IntervalLock} from './interval-lock.js';
import {LockHolder} from './lock-holder.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type NamespaceName} from '../kube/resources/namespace/namespace-name.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {LockAcquisitionError} from './lock-acquisition-error.js';

/**
 * Manages the acquisition and renewal of locks.
 */
@injectable()
export class LockManager {
  /**
   * Creates a new lock manager.
   *
   * @param _renewalService - the lock renewal service.
   * @param _logger - the logger.
   * @param k8Factory - the Kubernetes client.
   * @param configManager - the configuration manager.
   */
  constructor(
    @inject(InjectTokens.LockRenewalService) private readonly _renewalService?: LockRenewalService,
    @inject(InjectTokens.SoloLogger) private readonly _logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
  ) {
    this._renewalService = patchInject(_renewalService, InjectTokens.LockRenewalService, this.constructor.name);
    this._logger = patchInject(_logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
  }

  /**
   * Creates a new lease. This lease is not acquired until the `acquire` method is called.
   *
   * @returns a new lease instance.
   */
  public async create(): Promise<Lock> {
    return new IntervalLock(this.k8Factory, this._renewalService, LockHolder.default(), await this.currentNamespace());
  }

  /**
   * Retrieves the renewal service implementation.
   *
   * @returns the lease renewal service.
   */
  public get renewalService(): LockRenewalService {
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
   * @throws LockAcquisitionError if the namespace does not exist and cannot be created.
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
        throw new LockAcquisitionError(`failed to create the '${namespace}' namespace`);
      }
    }

    return namespace;
  }
}
