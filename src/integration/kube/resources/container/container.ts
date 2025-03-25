// SPDX-License-Identifier: Apache-2.0

import {type TarCreateFilter} from '../../../../types/aliases.js';
import {type TDirectoryData} from '../../t-directory-data.js';

export interface Container {
  /**
   * Copy a file from a container
   *
   * It overwrites any existing file at the destination directory
   * @param srcPath - the path to the file to copy
   * @param destDir - the destination directory
   */
  copyFrom(srcPath: string, destDir: string): Promise<unknown>;

  /**
   * Copy a file into a container
   *
   * It overwrites any existing file inside the container at the destination directory
   * @param srcPath - the path of the local file to copy
   * @param destDir - the remote destination directory
   * @param [filter] - the filter to pass to tar to keep or skip files or directories
   * @returns a Promise that performs the copy operation
   */
  copyTo(srcPath: string, destDir: string, filter?: TarCreateFilter | undefined): Promise<boolean>;

  /**
   * Invoke sh command within a container and return the console output as string
   * @param command - sh commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @returns console output as string
   */
  execContainer(command: string | string[]): Promise<string>;

  /**
   * Check if a directory exists in the specified container
   * @param destPath - the path to the directory inside the container
   */
  hasDir(destPath: string): Promise<boolean>;

  /**
   * Check if a file exists in the specified container
   * @param destPath - the remote path to the file
   * @param [filters] - optional filters to apply to the tar stream
   */
  hasFile(destPath: string, filters?: object): Promise<boolean>;

  /**
   * List files and directories in a container
   *
   * It runs ls -la on the specified path and returns a list of object containing the entries.
   * For example:
   * [{
   *    directory: false,
   *    owner: hedera,
   *    group: hedera,
   *    size: 121,
   *    modifiedAt: Jan 15 13:50
   *    name: config.txt
   * }]
   * @param destPath - the remote path to the directory
   * @returns a promise that returns array of directory entries, custom object
   */
  listDir(destPath: string): Promise<any[] | TDirectoryData[]>;

  /**
   * Make a directory in the specified container
   * @param destPath - the remote path to the directory
   */
  mkdir(destPath: string): Promise<string>;
}
