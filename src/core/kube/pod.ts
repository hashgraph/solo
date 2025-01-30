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
import {type ExtendedNetServer} from '../../types/index.js';
import type TDirectoryData from './t_directory_data.js';
import {type TarCreateFilter} from '../../types/aliases.js';

export interface Pod {
  copyFrom(containerName: string, srcPath: string, destDir: string): Promise<unknown>;

  copyTo(
    containerName: string,
    srcPath: string,
    destDir: string,
    filter: TarCreateFilter | undefined,
  ): Promise<boolean>;

  execContainer(containerName: string, command: string | string[]): Promise<string>;

  hasDir(containerName: string, destPath: string): Promise<boolean>;

  hasFile(containerName: string, destPath: string, filters: object): Promise<boolean>;

  killPod(): Promise<void>;

  listDir(containerName: string, destPath: string): Promise<any[] | TDirectoryData[]>;

  mkdir(containerName: string, destPath: string): Promise<string>;

  portForward(localPort: number, podPort: number): Promise<ExtendedNetServer>;

  stopPortForward(server: ExtendedNetServer, maxAttempts: number, timeout: number): Promise<void>;
}
