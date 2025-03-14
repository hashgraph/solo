// SPDX-License-Identifier: Apache-2.0

/**
 * Represents supported operating systems.
 */
export enum OperatingSystem {
  WINDOWS = 'windows',
  LINUX = 'linux',
  DARWIN = 'darwin',
}

export namespace OperatingSystem {
  /**
   * Returns the directory name associated with an operating system.
   * @param os - The operating system enum value
   * @returns The directory name for the operating system
   */
  export function directoryName(os: OperatingSystem): string {
    return os;
  }

  /**
   * Attempts to determine the current operating system based on process.platform.
   *
   * @returns The current operating system.
   * @throws Error if the current operating system is not supported.
   */
  export function current(): OperatingSystem {
    const platform = process.platform;

    if (platform === 'win32') {
      return OperatingSystem.WINDOWS;
    } else if (platform === 'linux') {
      return OperatingSystem.LINUX;
    } else if (platform === 'darwin') {
      return OperatingSystem.DARWIN;
    }

    throw new Error(`Unsupported operating system: ${platform}`);
  }
}
