/**
 * SPDX-License-Identifier: Apache-2.0
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
