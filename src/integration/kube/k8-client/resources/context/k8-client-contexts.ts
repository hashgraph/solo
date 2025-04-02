// SPDX-License-Identifier: Apache-2.0

import {type Contexts} from '../../../resources/context/contexts.js';
import {type KubeConfig, CoreV1Api} from '@kubernetes/client-node';
import {NamespaceName} from '../../../resources/namespace/namespace-name.js';

export class K8ClientContexts implements Contexts {
  public constructor(private readonly kubeConfig: KubeConfig) {}

  public list(): string[] {
    const contexts: string[] = [];

    for (const context of this.kubeConfig.getContexts()) {
      contexts.push(context.name);
    }

    return contexts;
  }

  public readCurrent(): string {
    return this.kubeConfig.getCurrentContext();
  }

  public readCurrentNamespace(): NamespaceName {
    return NamespaceName.of(this.kubeConfig.getContextObject(this.readCurrent())?.namespace);
  }

  public updateCurrent(context: string): void {
    this.kubeConfig.setCurrentContext(context);
  }

  public async testContextConnection(context: string): Promise<boolean> {
    const originalContextName = this.readCurrent();
    this.kubeConfig.setCurrentContext(context);

    const temporaryKubeClient = this.kubeConfig.makeApiClient(CoreV1Api);
    return await temporaryKubeClient
      .listNamespace()
      .then(() => {
        this.kubeConfig.setCurrentContext(originalContextName);
        return true;
      })
      .catch(() => {
        this.kubeConfig.setCurrentContext(originalContextName);
        return false;
      });
  }
}
