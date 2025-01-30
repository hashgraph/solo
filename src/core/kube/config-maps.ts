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
import {type V1ConfigMap} from '@kubernetes/client-node';

export default interface ConfigMaps {
  create(
    namespace: string,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>; // TODO was createNamespacedConfigMap
  delete(namespace: string, name: string): Promise<boolean>; // TODO was deleteNamespacedConfigMap
  read(namespace: string, name: string): Promise<V1ConfigMap>; // TODO was getNamespacedConfigMap
  replace(
    namespace: string,
    name: string,
    labels: Record<string, string>,
    data: Record<string, string>,
  ): Promise<boolean>; // TODO was replaceNamespacedConfigMap
}
