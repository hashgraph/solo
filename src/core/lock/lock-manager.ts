// SPDX-License-Identifier: Apache-2.0

import {Flags as flags} from '../../commands/flags.js';
import {type ConfigManager} from '../config-manager.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type Lock} from './lock.js';
import {type LockRenewalService} from './lock-renewal-service.js';
import {IntervalLock} from './interval-lock.js';
import {LockHolder} from './lock-holder.js';
import {inject, injectable} from 'tsyringe-neo';
import {patchInject} from '../dependency-injection/container-helper.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {LockAcquisitionError} from './lock-acquisition-error.js';
import {type RemoteConfigRuntimeStateApi} from '../../business/runtime-state/api/remote-config-runtime-state-api.js';
import {type Context} from '../../types/index.js';
import {DEFAULT_SOLO_NAMESPACE_LABELS} from '../constants.js';

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
   * @param remoteConfigRuntimeState
   */
  public constructor(
    @inject(InjectTokens.LockRenewalService) private readonly _renewalService?: LockRenewalService,
    @inject(InjectTokens.SoloLogger) private readonly _logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.ConfigManager) private readonly configManager?: ConfigManager,
    @inject(InjectTokens.RemoteConfigRuntimeState)
    private readonly remoteConfigRuntimeState?: RemoteConfigRuntimeStateApi,
  ) {
    this._renewalService = patchInject(_renewalService, InjectTokens.LockRenewalService, this.constructor.name);
    this._logger = patchInject(_logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.configManager = patchInject(configManager, InjectTokens.ConfigManager, this.constructor.name);
    this.remoteConfigRuntimeState = patchInject(
      remoteConfigRuntimeState,
      InjectTokens.RemoteConfigRuntimeState,
      this.constructor.name,
    );
  }

  /**
   * Creates a new lease. This lease is not acquired until the `acquire` method is called.
   *
   * @returns a new lease instance.
   */
  public async create(): Promise<Lock> {
    let namespace: NamespaceName;
    try {
      namespace = this.remoteConfigRuntimeState.getNamespace();
    } catch {
      // If the remote config is not loaded, we will use the context and namespace from the flags.
    }
    // A deployment can span many clusters. Every command and every user must lock the same one, so with a loaded
    // remote config the lease lives on its first cluster. getLeaseContext() throws if that cluster is not mapped.
    const context: Context = namespace
      ? this.remoteConfigRuntimeState.getLeaseContext()
      : this.configManager.getFlag<Context>(flags.context) || this.k8Factory.default().contexts().readCurrent();
    if (!namespace) {
      namespace = await this.currentNamespace(context);
    }
    return new IntervalLock(
      this.k8Factory,
      this._renewalService,
      LockHolder.default(),
      namespace,
      undefined,
      undefined,
      context,
    );
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
   * @param context - the kube context of the cluster which holds the lease.
   * @returns the namespace to use for lease acquisition or null if no namespace is specified.
   * @throws LockAcquisitionError if the namespace does not exist and cannot be created.
   */
  private async currentNamespace(context: Context): Promise<NamespaceName> {
    const deploymentNamespace: NamespaceName = this.configManager.getFlag(flags.namespace);
    const clusterSetupNamespace: NamespaceName = this.configManager.getFlag(flags.clusterSetupNamespace);

    if (!deploymentNamespace && !clusterSetupNamespace) {
      return null;
    }
    const namespace: NamespaceName = deploymentNamespace || clusterSetupNamespace;

    if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
      await this.k8Factory.getK8(context).namespaces().create(namespace, DEFAULT_SOLO_NAMESPACE_LABELS);

      if (!(await this.k8Factory.getK8(context).namespaces().has(namespace))) {
        throw new LockAcquisitionError(`failed to create the '${namespace}' namespace`);
      }
    }

    return namespace;
  }
}
