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
import { injectable } from 'inversify'
import {
  DeletePvcsFlag,
  DeleteSecretsFlag,
  ForceFlag,
  type AFlag,
  NamespaceFlag,
  QuietFlag
} from './flag.js'

export abstract class AFlags {
  readonly _flagMap: Map<string, any> = new Map<string, any>()

  static flags: object

  getFlagsArray (): AFlag[] {
    return Object.values(AFlags.flags)
  }

  getFlagValue (flagName: string): any {
    const userValue = this._flagMap.get(flagName)
    if (userValue === undefined) {
      return AFlags.flags[flagName].definition.defaultValue
    }
    return userValue
  }

  setFlagValue (flagName: string, flagValue: any) {
    this._flagMap.set(flagName, flagValue)
  }

  flagExists (flagName: string): boolean {
    return AFlags.flags[flagName] !== undefined
  }

  update (argv: object) {
    for (const argKey in Object.keys(argv)) {
      if (this.flagExists(argKey)) {
        this.setFlagValue(argKey, argv[argKey])
      }
    }
  }
}

@injectable()
export class NetworkDestroyFlags extends AFlags {
  static flags = {
    deletePvcs: new DeletePvcsFlag(),
    deleteSecrets: new DeleteSecretsFlag(),
    force: new ForceFlag(),
    namespace: new NamespaceFlag(),
    quiet: new QuietFlag()
  }
}
