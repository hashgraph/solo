// SPDX-License-Identifier: Apache-2.0

import * as Base64 from 'js-base64';
import {PrivateKey} from '@hiero-ledger/sdk';
import * as constants from './constants.js';
import {SoloErrors} from './errors/solo-errors.js';
import {SecretType} from '../integration/kube/resources/secret/secret-type.js';
import {type Secrets} from '../integration/kube/resources/secret/secrets.js';
import {type Secret} from '../integration/kube/resources/secret/secret.js';
import {type K8Factory} from '../integration/kube/k8-factory.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type Context} from '../types/index.js';

/**
 * Resolves and persists the genesis key of a deployed network.
 *
 * The genesis key is stored as a Kubernetes secret when the network is deployed so that later commands do not depend on
 * the `GENESIS_KEY` environment variable being set the same way. Lookup order: Kubernetes secret, then the
 * `GENESIS_KEY` environment variable, then the well-known default key.
 */
export class GenesisKeyResolver {
  public static readonly SECRET_NAME: string = 'genesis-key';
  private static readonly PRIVATE_KEY_DATA_KEY: string = 'privateKey';
  private static readonly PUBLIC_KEY_DATA_KEY: string = 'publicKey';

  /**
   * Store the effective genesis key (environment override or default) as a secret in each context.
   */
  public static async store(k8Factory: K8Factory, contexts: Context[], namespace: NamespaceName): Promise<void> {
    const data: Record<string, string> = {
      [GenesisKeyResolver.PRIVATE_KEY_DATA_KEY]: Base64.encode(constants.GENESIS_KEY),
      [GenesisKeyResolver.PUBLIC_KEY_DATA_KEY]: Base64.encode(constants.GENESIS_PUBLIC_KEY.toString()),
    };

    for (const context of contexts) {
      const isCreated: boolean = await k8Factory
        .getK8(context)
        .secrets()
        .createOrReplace(namespace, GenesisKeyResolver.SECRET_NAME, SecretType.OPAQUE, data);

      if (!isCreated) {
        throw new SoloErrors.system.k8sSecretCreateFailed(
          `failed to create genesis key secret using context: ${context}`,
        );
      }
    }
  }

  /**
   * Resolve the genesis private key: the stored secret when present in any context, otherwise the environment/default key.
   */
  public static async resolve(
    k8Factory: K8Factory,
    contexts: Context[],
    namespace: NamespaceName,
  ): Promise<PrivateKey> {
    for (const context of contexts) {
      const secrets: Secrets = k8Factory.getK8(context).secrets();
      if (await secrets.exists(namespace, GenesisKeyResolver.SECRET_NAME)) {
        const secret: Secret = await secrets.read(namespace, GenesisKeyResolver.SECRET_NAME);
        return PrivateKey.fromStringED25519(Base64.decode(secret.data[GenesisKeyResolver.PRIVATE_KEY_DATA_KEY]));
      }
    }

    return PrivateKey.fromStringED25519(constants.GENESIS_KEY);
  }
}
