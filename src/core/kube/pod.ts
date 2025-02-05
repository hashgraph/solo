/**
 * SPDX-License-Identifier: Apache-2.0
 */
import {type ExtendedNetServer} from '../../types/index.js';
import {type TDirectoryData} from './t_directory_data.js';
import {type TarCreateFilter} from '../../types/aliases.js';
import {type ContainerName} from './container_name.js';
import {type ContainerRef} from './container_ref.js';

export interface Pod {
  /**
   * Copy a file from a container
   *
   * It overwrites any existing file at the destination directory
   * @param containerRef - the reference to the container
   * @param srcPath - the path to the file to copy
   * @param destDir - the destination directory
   */
  copyFrom(containerRef: ContainerRef, srcPath: string, destDir: string): Promise<unknown>;

  /**
   * Copy a file into a container
   *
   * It overwrites any existing file inside the container at the destination directory
   * @param containerRef - the reference to the container
   * @param srcPath - the path of the local file to copy
   * @param destDir - the remote destination directory
   * @param [filter] - the filter to pass to tar to keep or skip files or directories
   * @returns a Promise that performs the copy operation
   */
  copyTo(
    containerRef: ContainerRef,
    srcPath: string,
    destDir: string,
    filter: TarCreateFilter | undefined,
  ): Promise<boolean>;

  /**
   * Invoke sh command within a container and return the console output as string
   * @param containerRef - the reference to the container
   * @param command - sh commands as an array to be run within the containerName (e.g 'ls -la /opt/hgcapp')
   * @returns console output as string
   */
  execContainer(containerRef: ContainerRef, command: string | string[]): Promise<string>;

  /**
   * Check if a directory exists in the specified container
   * @param containerRef - the reference to the container
   * @param destPath - the path to the directory inside the container
   */
  hasDir(containerRef: ContainerRef, destPath: string): Promise<boolean>;

  /**
   * Check if a file exists in the specified container
   * @param containerRef - the reference to the container
   * @param destPath - the remote path to the file
   * @param [filters] - optional filters to apply to the tar stream
   */
  hasFile(containerRef: ContainerRef, destPath: string, filters: object): Promise<boolean>;

  /**
   * Get a pod by name and namespace, will check every 1 second until the pod is no longer found.
   * Can throw a SoloError if there is an error while deleting the pod.
   */
  killPod(): Promise<void>;

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
   * @param containerRef - the reference to the container
   * @param destPath - the remote path to the directory
   * @returns a promise that returns array of directory entries, custom object
   */
  listDir(containerRef: ContainerRef, destPath: string): Promise<any[] | TDirectoryData[]>;

  /**
   * Make a directory in the specified container
   * @param containerRef - the reference to the container
   * @param destPath - the remote path to the directory
   */
  mkdir(containerRef: ContainerRef, destPath: string): Promise<string>;

  /**
   * Port forward a port from a pod to localhost
   *
   * This simple server just forwards traffic from itself to a service running in kubernetes
   * -> localhost:localPort -> port-forward-tunnel -> kubernetes-pod:targetPort
   * @param localPort - the local port to forward to
   * @param podPort - the port on the pod to forward from
   * @returns an instance of ExtendedNetServer
   */
  portForward(localPort: number, podPort: number): Promise<ExtendedNetServer>;

  /**
   * Stop the port forward
   * @param server - an instance of server returned by portForward method
   * @param [maxAttempts] - the maximum number of attempts to check if the server is stopped
   * @param [timeout] - the delay between checks in milliseconds
   */
  stopPortForward(server: ExtendedNetServer, maxAttempts: number, timeout: number): Promise<void>;
}
