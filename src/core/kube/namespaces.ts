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
export interface Namespaces {
  // TODO what should the name be if want to create multiple namespaces (theoretical and bad example), create multiple, should it be creates? createNamespaces?  or what? createList? createMultiple?
  //  - TypeScript allows overloading at the interface level, but not at the implementation level, we would need to check the type if doing that
  create(names: string): Promise<boolean>;
  // create(names: string[]): Promise<boolean>; // overloading example, have multiple interfaces, but only one implementation that infers the type
  // create(names: string | string[]): Promise<boolean>; // using alternative types
  // create({ name: string, names: string[]}) // using object with values

  delete(name: string): Promise<boolean>;

  list(): Promise<string[]>;

  has(namespace: string): Promise<boolean>;
}
