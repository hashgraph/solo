// SPDX-License-Identifier: Apache-2.0

import os from 'node:os';
import path from 'node:path';
import {SubprocessCommandProfile} from './subprocess-command-profile.js';
import {SoloErrors} from './errors/solo-errors.js';

/**
 * Builds a minimal, explicit environment for spawning external commands.
 *
 * Historically Solo spread the entire parent environment (`{...process.env}`) into every
 * child process, leaking any secret present in the parent (CI tokens, cloud credentials,
 * SSH/GPG agent vars, API keys) into tools that never need them. This class instead builds
 * the environment from scratch: a common base set plus the minimal per-command extras, and
 * drops everything else.
 *
 * Intentionally dependency-free (no dependency-injection, no logging, no heavy imports) so
 * that the standalone `persist-port-forward` script can import it without pulling in the
 * container. The registered error classes are the one exception; they have no runtime dependencies.
 */
export class SubprocessEnvironment {
  /** Environment variable names inherited by every external command on every platform. */
  private static readonly COMMON_ALLOWLIST: readonly string[] = [
    // command resolution (POSIX `PATH`, Windows `Path`)
    'PATH',
    'Path',
    // home directory (used to locate ~/.kube/config, ~/.config, credential caches)
    'HOME',
    'USERPROFILE',
    // locale
    'LANG',
    'LANGUAGE',
    'LC_ALL',
    'LC_CTYPE',
    'LC_MESSAGES',
    'TERM',
    // temp directory
    'TMPDIR',
    'TMP',
    'TEMP',
    // proxy configuration
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'all_proxy',
  ];

  /**
   * Additional variable names inherited only on Windows. Many binaries fail to start at all
   * without these (e.g. `SystemRoot`, `PATHEXT`), so they are always allowed on win32.
   */
  private static readonly WINDOWS_ALLOWLIST: readonly string[] = [
    'SystemRoot',
    'SystemDrive',
    'windir',
    'COMSPEC',
    'PATHEXT',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
    'LOCALAPPDATA',
    'APPDATA',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'USERNAME',
    'USERDOMAIN',
  ];

  /** Exact variable names allowed in addition to the common base set, per command profile. */
  private static readonly COMMAND_ALLOWLIST: Record<SubprocessCommandProfile, readonly string[]> = {
    [SubprocessCommandProfile.GENERIC]: [],
    [SubprocessCommandProfile.KUBECTL]: ['KUBECONFIG', 'KUBERNETES_SERVICE_HOST', 'KUBERNETES_SERVICE_PORT'],
    // DOCKER_CONFIG: helm consults the Docker/OCI registry credential file
    // ($DOCKER_CONFIG/config.json) when pulling OCI charts.
    [SubprocessCommandProfile.HELM]: ['KUBECONFIG', 'DOCKER_CONFIG'],
    [SubprocessCommandProfile.KIND]: [
      'KUBECONFIG',
      'KIND_EXPERIMENTAL_PROVIDER',
      'DOCKER_HOST',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      // Kind delegates image operations to the container engine (docker/podman), which reads
      // these registry/storage config locations; forward them so a podman-backed kind works.
      'DOCKER_CONFIG',
      'CONTAINER_HOST',
      'CONTAINERS_CONF',
      'CONTAINERS_REGISTRIES_CONF',
      'CONTAINERS_STORAGE_CONF',
      'XDG_RUNTIME_DIR',
    ],
    [SubprocessCommandProfile.CONTAINER_ENGINE]: [
      'DOCKER_HOST',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
      'DOCKER_CONFIG',
      'DOCKER_CONTEXT',
      'CONTAINER_HOST',
      'CONTAINERS_CONF',
      'CONTAINERS_REGISTRIES_CONF',
      'CONTAINERS_STORAGE_CONF',
      'REGISTRY_AUTH_FILE',
      'XDG_RUNTIME_DIR',
      'XDG_CONFIG_HOME',
    ],
    [SubprocessCommandProfile.BREW]: ['NONINTERACTIVE'],
    [SubprocessCommandProfile.NPM]: ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'npm_config_registry'],
    [SubprocessCommandProfile.GITHUB_CLI]: [
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'GH_ENTERPRISE_TOKEN',
      'GH_HOST',
      'GH_CONFIG_DIR',
      'XDG_CONFIG_HOME',
    ],
  };

  /**
   * Variable name prefixes allowed in addition to the exact names, per command profile.
   * These cover the families of settings a tool honors (e.g. `HELM_*`, `HOMEBREW_*`).
   */
  private static readonly COMMAND_PREFIX_ALLOWLIST: Partial<Record<SubprocessCommandProfile, readonly string[]>> = {
    [SubprocessCommandProfile.HELM]: ['HELM_'],
    [SubprocessCommandProfile.BREW]: ['HOMEBREW_'],
  };

  /**
   * Environment variables established at runtime for the remainder of this solo invocation
   * (e.g. `KIND_EXPERIMENTAL_PROVIDER` once kind is configured to use podman, or
   * `CONTAINERS_CONF` once a solo-owned podman configuration is written). They are merged over
   * the parent environment and pass through the same per-profile allowlists, so they behave
   * exactly like inherited variables — without mutating the global `process.env`.
   */
  private static readonly sessionVariables: Map<string, string> = new Map();

  /** Directories prepended to the `PATH` handed to every child process, highest precedence first. */
  private static readonly sessionPathPrepends: string[] = [];

  /** Directories appended to the `PATH` handed to every child process, in registration order. */
  private static readonly sessionPathAppends: string[] = [];

  /** Returns true when the current platform is Windows. Isolated for testability. */
  private static isWindowsPlatform(): boolean {
    return os.platform() === 'win32';
  }

  /**
   * Registers an environment variable for every subsequently spawned command in this solo
   * invocation. The variable is still subject to the per-profile allowlists, exactly as if it
   * were present in the parent environment. `PATH` must not be set this way — use
   * {@link prependSessionPath} / {@link appendSessionPath} instead.
   *
   * @param name - the environment variable name
   * @param value - the value to hand to child processes
   */
  public static setSessionVariable(name: string, value: string): void {
    if (name.toLowerCase() === 'path') {
      throw new SoloErrors.validation.illegalArgument(
        'PATH must be registered with prependSessionPath/appendSessionPath',
        name,
      );
    }
    SubprocessEnvironment.sessionVariables.set(name, value);
  }

  /**
   * The value registered via {@link setSessionVariable} for this solo invocation, or undefined.
   * Callers that also honor a user-provided variable should fall back to the parent environment
   * when this returns undefined.
   *
   * @param name - the environment variable name
   */
  public static sessionVariable(name: string): string | undefined {
    return SubprocessEnvironment.sessionVariables.get(name);
  }

  /**
   * Registers a directory to prepend to the `PATH` of every subsequently spawned command in this
   * solo invocation. The directory takes precedence over previously registered ones. Duplicate
   * registrations are ignored.
   *
   * @param directory - the directory holding binaries child processes must resolve first
   */
  public static prependSessionPath(directory: string): void {
    if (directory && !SubprocessEnvironment.isSessionPathRegistered(directory)) {
      SubprocessEnvironment.sessionPathPrepends.unshift(directory);
    }
  }

  /**
   * Registers a directory to append to the `PATH` of every subsequently spawned command in this
   * solo invocation. Duplicate registrations are ignored.
   *
   * @param directory - the directory holding binaries child processes should be able to resolve
   */
  public static appendSessionPath(directory: string): void {
    if (directory && !SubprocessEnvironment.isSessionPathRegistered(directory)) {
      SubprocessEnvironment.sessionPathAppends.push(directory);
    }
  }

  /**
   * The `PATH` child processes resolve binaries against: the parent `PATH` wrapped with the
   * session path additions. For callers that construct explicit environment prefixes
   * (`sudo env PATH=...`) or `PATH` overrides instead of relying on {@link forCommand}.
   */
  public static currentPath(): string {
    const base: string = process.env.PATH ?? process.env.Path ?? '';
    return SubprocessEnvironment.withSessionPathAdditions(base);
  }

  /** Clears every session variable and path addition. Session state is write-once per invocation; only tests may call this. */
  public static resetForTesting(): void {
    SubprocessEnvironment.sessionVariables.clear();
    SubprocessEnvironment.sessionPathPrepends.length = 0;
    SubprocessEnvironment.sessionPathAppends.length = 0;
  }

  /** The environment's `PATH` key, matched case-insensitively (POSIX `PATH`, Windows `Path`); `PATH` when absent. */
  public static pathKey(environment: Record<string, string>): string {
    return Object.keys(environment).find((key: string): boolean => key.toLowerCase() === 'path') ?? 'PATH';
  }

  private static isSessionPathRegistered(directory: string): boolean {
    return (
      SubprocessEnvironment.sessionPathPrepends.includes(directory) ||
      SubprocessEnvironment.sessionPathAppends.includes(directory)
    );
  }

  private static withSessionPathAdditions(basePath: string): string {
    return [
      ...SubprocessEnvironment.sessionPathPrepends,
      ...(basePath ? [basePath] : []),
      ...SubprocessEnvironment.sessionPathAppends,
    ].join(path.delimiter);
  }

  /**
   * Builds the minimal environment for the given command profile.
   *
   * @param profile - the command the environment is being built for
   * @param overrides - variables applied last, overriding anything inherited (e.g. a
   *   `PATH` with the tool's installation directory prepended, or `KUBECONFIG` pointed at a
   *   null device). These are always present in the result regardless of the allowlist.
   * @returns a fresh environment object containing only the allowlisted variables plus overrides
   */
  public static forCommand(
    profile: SubprocessCommandProfile,
    overrides: Record<string, string> = {},
  ): Record<string, string> {
    const onWindows: boolean = SubprocessEnvironment.isWindowsPlatform();
    // Windows environment variable names are case-insensitive, and shells expose them in varying
    // case (e.g. Git-bash surfaces `SYSTEMROOT` where the allowlist says `SystemRoot`). Compare
    // case-insensitively on Windows so the intended variables are still forwarded; POSIX names
    // stay case-sensitive.
    const normalize: (name: string) => string = (name: string): string => (onWindows ? name.toLowerCase() : name);

    const allowedExactNames: Set<string> = new Set<string>(
      [
        ...SubprocessEnvironment.COMMON_ALLOWLIST,
        ...(onWindows ? SubprocessEnvironment.WINDOWS_ALLOWLIST : []),
        ...SubprocessEnvironment.COMMAND_ALLOWLIST[profile],
      ].map((name: string): string => normalize(name)),
    );
    const allowedPrefixes: readonly string[] = (SubprocessEnvironment.COMMAND_PREFIX_ALLOWLIST[profile] ?? []).map(
      (prefix: string): string => normalize(prefix),
    );

    const isAllowedName: (name: string) => boolean = (name: string): boolean => {
      const normalized: string = normalize(name);
      return (
        allowedExactNames.has(normalized) ||
        allowedPrefixes.some((prefix: string): boolean => normalized.startsWith(prefix))
      );
    };

    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (value !== undefined && isAllowedName(name)) {
        // Preserve the original variable name (and its casing) for the child process.
        environment[name] = value;
      }
    }
    // Separate pass: session state must never be counted or reported as parent-environment inheritance.
    for (const [name, value] of SubprocessEnvironment.sessionVariables.entries()) {
      if (isAllowedName(name)) {
        environment[name] = value;
      }
    }

    if (SubprocessEnvironment.sessionPathPrepends.length > 0 || SubprocessEnvironment.sessionPathAppends.length > 0) {
      const pathKey: string = SubprocessEnvironment.pathKey(environment);
      // Deliberate: even with no parent PATH the child gets one, so solo-installed binaries resolve.
      environment[pathKey] = SubprocessEnvironment.withSessionPathAdditions(environment[pathKey] ?? '');
    }

    return {...environment, ...overrides};
  }
}
