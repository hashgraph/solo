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
import {type Optional} from '../../types/index.js';

export default interface Secrets {
  create(
    namespace: string,
    name: string,
    secretType: string,
    data: Record<string, string>,
    labels: Optional<Record<string, string>>,
    recreate: boolean,
  ): Promise<boolean>; // TODO was createSecret
  delete(namespace: string, name: string): Promise<boolean>; // TODO was deleteSecret
  listByLabel(namespace: string, labels: string[]): Promise<any>; // TODO was getSecretsByLabel(labels: string[]): Promise<any>
  // TODO consolidate getSecret into listByLabel
  // TODO consolidatelistSecretsByNamespace into listByLabel
}
