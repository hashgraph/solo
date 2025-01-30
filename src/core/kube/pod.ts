/**
 * SPDX-License-Identifier: Apache-2.0
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
