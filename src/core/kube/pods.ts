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
import {type V1Pod} from '@kubernetes/client-node';

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
export default interface Pods {
  byName(name: string): Promise<V1Pod>; // TODO was getPodByName
  byLabel(labels: string[]): Promise<any>; // TODO was getPodsByLabel
  waitForConditions(
    conditionsMap: Map<string, string>,
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
    namespace?: string,
  ): Promise<any>; // TODO was waitForPodConditions
  waitForReady(
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
    namespace?: string,
  ): Promise<V1Pod[]>; // TODO was waitForPodReady
  wait(
    phases: string[],
    labels: string[],
    podCount: number,
    maxAttempts: number,
    delay: number,
    podItemPredicate?: (items: V1Pod) => boolean,
    namespace?: string,
  ): Promise<V1Pod[]>; // TODO was waitForPods
}
