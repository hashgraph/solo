/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type K8Factory} from '../k8_factory.js';
import {type K8} from '../k8.js';
import {K8Client} from './k8_client.js';
import {injectable} from 'tsyringe-neo';

@injectable()
export class K8ClientFactory implements K8Factory {
  private readonly k8Clients: Map<string, K8> = new Map<string, K8>();

  public getK8(context: string): K8 {
    if (!this.k8Clients.has(context)) {
      this.k8Clients.set(context, this.createK8Client(context));
    }

    return this.k8Clients.get(context)!;
  }

  /**
   * Create a new k8Factory client for the given context
   * @param context - The context to create the k8Factory client for
   * @returns a new k8Factory client
   */
  private createK8Client(context: string): K8 {
    return new K8Client(context);
  }

  public default(): K8 {
    return new K8Client(undefined);
  }
}
