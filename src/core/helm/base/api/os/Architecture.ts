// SPDX-License-Identifier: Apache-2.0

/**
 * Represents supported CPU architectures.
 */
export enum Architecture {
  X64 = 'x64',
  ARM = 'arm',
  ARM64 = 'arm64',
  I386 = 'i386',
  PPC64 = 'ppc64',
  S390X = 's390x',
}

export namespace Architecture {
  /**
   * Returns the directory name associated with an architecture.
   * @param arch - The architecture enum value
   * @returns The directory name for the architecture
   */
  export function directoryName(arch: Architecture): string {
    return arch;
  }

  /**
   * Attempts to determine the current architecture based on process.arch.
   *
   * @returns The current architecture.
   * @throws Error if the current architecture is not supported.
   */
  export function current(): Architecture {
    const arch = process.arch.toLowerCase();

    if (arch === 'x64') {
      return Architecture.X64;
    } else if (arch === 'arm64') {
      return Architecture.ARM64;
    } else if (arch === 'arm') {
      return Architecture.ARM;
    } else if (arch === 'ia32') {
      return Architecture.I386;
    } else if (arch === 'ppc64') {
      return Architecture.PPC64;
    } else if (arch === 's390x') {
      return Architecture.S390X;
    }

    throw new Error(`Unsupported architecture: ${arch}`);
  }
}
