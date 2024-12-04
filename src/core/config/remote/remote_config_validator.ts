/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import * as constants from '../../constants.js';

import type {K8} from '../../k8.js';
import type {ComponentsDataWrapper} from './components_data_wrapper.js';

export class RemoteConfigValidator {
  public static async validateComponents(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all([
      RemoteConfigValidator.validateRelays(components, k8),
      RemoteConfigValidator.validateHaProxies(components, k8),
      RemoteConfigValidator.validateMirrorNodes(components, k8),
      RemoteConfigValidator.validateEnvoyProxies(components, k8),
      RemoteConfigValidator.validateConsensusNodes(components, k8),
      RemoteConfigValidator.validateMirrorNodeExplorers(components, k8),
    ]);
  }

  private static async validateRelays(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all(
      Object.values(components.relays).map(async component => {
        try {
          await k8.getPodsByLabel([constants.SOLO_RELAY_LABEL]);
        } catch (e) {
          throw new Error(
            `Relay in remote config with name ${component.name} was not found in namespace ${component.namespace}`,
            e,
          );
        }
      }),
    );
  }

  private static async validateHaProxies(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all(
      Object.values(components.haProxies).map(async component => {
        try {
          await k8.getPodByName(component.name);
        } catch (e) {
          throw new Error(
            `HaProxy in remote config with name ${component.name} was not found in namespace ${component.namespace}`,
            e,
          );
        }
      }),
    );
  }

  private static async validateMirrorNodes(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all(
      Object.values(components.mirrorNodes).map(async component => {
        try {
          await k8.getPodsByLabel(constants.SOLO_HEDERA_MIRROR_IMPORTER);
        } catch (e) {
          throw new Error(
            `Mirror node in remote config with name ${component.name} was not found in namespace ${component.namespace}`,
            e,
          );
        }
      }),
    );
  }

  private static async validateEnvoyProxies(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all(
      Object.values(components.envoyProxies).map(async component => {
        try {
          await k8.getPodByName(component.name);
        } catch (e) {
          throw new Error(
            `Envoy proxy in remote config with name ${component.name} was not found in namespace ${component.namespace}`,
            e,
          );
        }
      }),
    );
  }

  private static async validateConsensusNodes(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all(
      Object.values(components.consensusNodes).map(async component => {
        try {
          await k8.getPodByName(component.name);
        } catch (e) {
          throw new Error(
            `Consensus node in remote config with name ${component.name} was not found in namespace ${component.namespace}`,
            e,
          );
        }
      }),
    );
  }

  private static async validateMirrorNodeExplorers(components: ComponentsDataWrapper, k8: K8): Promise<void> {
    await Promise.all(
      Object.values(components.mirrorNodeExplorers).map(async component => {
        try {
          await k8.getPodsByLabel([constants.SOLO_HEDERA_EXPLORER_LABEL]);
        } catch (e) {
          throw new Error(
            `Mirror node explorer in remote config with name ${component.name}` +
              ` was not found in namespace ${component.namespace}`,
            e,
          );
        }
      }),
    );
  }
}
