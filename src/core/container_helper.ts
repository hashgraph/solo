/**
 * Copyright (C) 2025 Hedera Hashgraph, LLC
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
import {container} from 'tsyringe-neo';

/**
 * code to patch inject bug with tsyringe: https://github.com/risen228/tsyringe-neo/issues/5
 * @param parameterValue - the value that should have been injected as a parameter in the constructor
 * @param registryToken - the token to resolve from the container
 * @param callingClassName - the name of the class that is calling this function
 */
export function patchInject(parameterValue: any, registryToken: any, callingClassName: string) {
  if (registryToken === undefined || registryToken === null) {
    throw new Error(`registryToken is undefined or null, callingClassName: ${callingClassName}`);
  }
  if (parameterValue === undefined || parameterValue === null) {
    return container.resolve(registryToken);
  }

  return parameterValue;
}
