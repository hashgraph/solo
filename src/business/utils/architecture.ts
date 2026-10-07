// SPDX-License-Identifier: Apache-2.0

export enum ArchitectureType {
  AMD64 = 'amd64',
  ARM64 = 'arm64',
}

export class Architecture {
  public static readonly NODE_ARCH_X64: string = 'x64';
  public static readonly NODE_ARCH_ARM64: string = 'arm64';
  public static readonly NODE_ARCH_AARCH64: string = 'aarch64';

  /** Linux / Docker daemon architecture names */
  public static readonly LINUX_ARCH_X86_64: string = 'x86_64';
  public static readonly LINUX_ARCH_AMD64: string = 'amd64';

  public static readonly LINUX_AMD64: string = 'linux/amd64';
  public static readonly LINUX_ARM64: string = 'linux/arm64';

  public static getArchitecture(rawArchitecture: string = process.arch): ArchitectureType {
    switch (rawArchitecture) {
      case Architecture.NODE_ARCH_X64:
      case Architecture.LINUX_ARCH_X86_64:
      case Architecture.LINUX_ARCH_AMD64: {
        return ArchitectureType.AMD64;
      }
      case Architecture.NODE_ARCH_ARM64:
      case Architecture.NODE_ARCH_AARCH64: {
        return ArchitectureType.ARM64;
      }
      default: {
        throw new Error(`Unsupported host architecture: ${rawArchitecture}`);
      }
    }
  }

  public static getLinuxPlatform(rawArchitecture: string = process.arch): string {
    const architecture: ArchitectureType = Architecture.getArchitecture(rawArchitecture);

    switch (architecture) {
      case ArchitectureType.AMD64: {
        return Architecture.LINUX_AMD64;
      }
      case ArchitectureType.ARM64: {
        return Architecture.LINUX_ARM64;
      }
    }
  }

  public static isAmd64(rawArchitecture: string = process.arch): boolean {
    return Architecture.getArchitecture(rawArchitecture) === ArchitectureType.AMD64;
  }

  public static isArm64(rawArchitecture: string = process.arch): boolean {
    return Architecture.getArchitecture(rawArchitecture) === ArchitectureType.ARM64;
  }

  public static getRawArchitecture(rawArchitecture: string = process.arch): string {
    return rawArchitecture;
  }
}
