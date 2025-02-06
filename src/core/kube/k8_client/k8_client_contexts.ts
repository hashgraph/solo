/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type Contexts} from '../contexts.js';
import {type KubeConfig, CoreV1Api} from '@kubernetes/client-node';
import {NamespaceName} from '../namespace_name.js';

export default class K8ClientContexts implements Contexts {
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
    const originalCtxName = this.readCurrent();
    this.kubeConfig.setCurrentContext(context);

    const tempKubeClient = this.kubeConfig.makeApiClient(CoreV1Api);
    return await tempKubeClient
      .listNamespace()
      .then(() => {
        this.kubeConfig.setCurrentContext(originalCtxName);
        return true;
      })
      .catch(() => {
        this.kubeConfig.setCurrentContext(originalCtxName);
        return false;
      });
  }
}
