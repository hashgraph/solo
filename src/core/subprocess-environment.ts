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
 * ## Why this is an allowlist, and must stay one
 *
 * An allowlist is deny-by-default, so a variable nobody enumerated silently disappears. That
 * has a real cost — it is what caused #5895, where EKS IRSA broke because `AWS_ROLE_ARN` and
 * `AWS_WEB_IDENTITY_TOKEN_FILE` were missing from {@link CLOUD_AUTHENTICATION_ALLOWLIST} and
 * the `aws eks get-token` credential plugin had nothing to authenticate with. The failure was
 * silent and remote, and diagnosing it required replacing the `helm` binary with a recorder.
 *
 * Inverting this to a denylist — inherit everything, subtract secret-shaped names — was
 * proposed while fixing #5895 and **rejected**. Do not re-attempt it. The argument for it was
 * that a missed secret is marginal, because every profile already receives `HOME`, `PATH` and
 * `KUBECONFIG`, so a spawned tool could read `~/.aws/credentials` or `~/.kube/config` off disk
 * regardless. That reasoning covers *confidentiality* only, and it assumes the threat is a
 * compromised binary.
 *
 * The threat that matters here is the opposite: an **honest binary and a poisoned environment**
 * (a compromised earlier CI step, a malicious `.envrc`, a tampered shell profile). An attacker
 * who can set environment variables but cannot replace the binary still gets code execution and
 * man-in-the-middle through variables that carry no secret-shaped name at all, so no name
 * heuristic can catch them:
 *
 *  - `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `NODE_OPTIONS=--require`,
 *    `BASH_ENV`, `PYTHONPATH` — arbitrary code execution inside a process Solo just handed
 *    cluster-admin.
 *  - `SSL_CERT_FILE`, `SSL_CERT_DIR`, `CURL_CA_BUNDLE`, `NODE_EXTRA_CA_CERTS`, `AWS_CA_BUNDLE`
 *    — trust an attacker CA and intercept the Kubernetes API.
 *  - `AWS_ENDPOINT_URL`, `AWS_CONFIG_FILE` — redirect STS, exfiltrating the very workload
 *    identity credentials {@link CLOUD_AUTHENTICATION_ALLOWLIST} exists to enable.
 *  - `GIT_SSH_COMMAND`, `GIT_EXTERNAL_DIFF`, `PS4` — command execution.
 *
 * Measured against those 19 variables, the proposed denylist forwarded 19/19 to `helm`; this
 * allowlist blocks 18/19. (The exception is `HELM_DRIVER`, which the `HELM_` entry in
 * {@link COMMAND_PREFIX_ALLOWLIST} lets through — prefix rules are the remaining soft spot.)
 * `test/unit/core/subprocess-environment.test.ts` pins this so a future loosening fails loudly.
 *
 * Note in particular that "a path is not a secret, so `*_FILE` names are safe" is **false** in
 * this context: it holds for confidentiality and fails for integrity, since a path pointing at
 * an attacker-controlled file is the classic injection vector.
 *
 * ## Living with deny-by-default
 *
 * The cost of an allowlist is the silent failure above, so it is mitigated rather than accepted.
 * `forCommand()` takes an optional diagnostic callback receiving the *names* of every withheld
 * variable (never values), which `ShellRunner` and `HelmExecutionBuilder` log at **info** level,
 * once per command profile per run. Info rather than debug is deliberate: `solo.log` is written
 * at `SOLO_LOG_LEVEL`, which defaults to `info`, so a user can answer "was my environment
 * variable filtered out?" by searching the log they already have, instead of having to know to
 * re-run with `--debug`. The list is unfiltered for the same reason — reporting only names that
 * look "interesting" would hide exactly the user-defined variable someone is searching for.
 *
 * When adding support for a new platform, prefer adding exact names here over loosening the
 * mechanism, and record why anything is deliberately excluded.
 *
 * Intentionally dependency-free (no dependency-injection, no logging, no heavy imports) so
 * that the standalone `persist-port-forward` script can import it without pulling in the
 * container. That is why the diagnostic is a caller-supplied callback rather than an injected
 * logger: `constants.ts` transitively pulls in `@hiero-ledger/sdk` and `listr2`.
 * The registered error classes are the one exception; they have no runtime dependencies.
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

  /**
   * Exact names required by the AWS credential plugin that `kubectl` and `helm` invoke to
   * authenticate against EKS. Without these the kubeconfig `exec` plugin has nothing to
   * authenticate with and every cluster operation fails.
   *
   * These are the variables whose absence caused #5895: the pod identity webhook injects
   * `AWS_ROLE_ARN` and `AWS_WEB_IDENTITY_TOKEN_FILE`, and `aws eks get-token` exchanges that
   * projected service account token for role credentials. Every entry is an identifier, a
   * region/endpoint selector, or a path to a token the platform placed on disk — none carries a
   * secret value.
   *
   * **Scoped to AWS on purpose.** GKE and AKS have the same bug, and equivalents for them
   * (`GOOGLE_APPLICATION_CREDENTIALS`, `AZURE_FEDERATED_TOKEN_FILE`, …) are deliberately *not*
   * added here, because nobody has run Solo against those platforms to establish which names are
   * actually required. #4954 built its allowlist from observation on kind clusters and missed the
   * EKS `exec` credential-plugin path entirely, which is precisely how #5895 happened; adding
   * unobserved names would repeat that mistake in the opposite direction and imply support that
   * has never been exercised. The speculative `AZURE_AUTHORITY_HOST` entry that review removed
   * from an earlier revision of this list — an authority-endpoint redirect, the Azure twin of the
   * excluded `AWS_ENDPOINT_URL` — is the concrete argument against guessing.
   *
   * A GKE or AKS operator is not blocked in the meantime: they can forward the names their
   * platform needs through `subprocess.additionalEnvironmentVariables` without waiting for a
   * release. When someone verifies the required set against a real cluster, it belongs here.
   *
   * Deliberately NOT included, because each one redirects where the tool looks for trust or
   * credentials and so is an attack vector rather than a requirement:
   *  - `AWS_CA_BUNDLE`, `AWS_ENDPOINT_URL`: point TLS trust or the STS endpoint at an attacker.
   *  - `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`: an AWS config file may declare
   *    `credential_process`, which is arbitrary command execution. The default location under
   *    `HOME` is still honored.
   */
  private static readonly CLOUD_AUTHENTICATION_ALLOWLIST: readonly string[] = [
    // AWS / EKS IRSA
    'AWS_ROLE_ARN',
    'AWS_WEB_IDENTITY_TOKEN_FILE',
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'AWS_STS_REGIONAL_ENDPOINTS',
    'AWS_PROFILE',
  ];

  /**
   * Names an operator may never add through `subprocess.additionalEnvironmentVariables`, no matter
   * what the config file says.
   *
   * The escape hatch exists so a missing platform variable does not require a Solo release. But a
   * config file is a trust boundary, not a guarantee: if `~/.solo` is hijacked, an unrestricted
   * passthrough list would turn "attacker can write a config file" into "attacker gets arbitrary
   * code execution on the operator's machine, inside a process holding cluster-admin", simply by
   * listing `LD_PRELOAD`. Without this list, that escalation is a one-line edit.
   *
   * These entries are therefore refused unconditionally. They fall into three families, and none
   * is ever needed to authenticate to a cluster:
   *  - loader and interpreter hooks that inject code into the spawned process;
   *  - TLS trust overrides that enable a man-in-the-middle on the Kubernetes API;
   *  - credential/endpoint redirection, including config files that can declare an arbitrary
   *    `credential_process` command.
   *
   * `PATH` is deliberately absent: it is on {@link COMMON_ALLOWLIST} and therefore inherited from
   * the parent environment regardless, so listing it here would imply a protection that does not
   * exist. Search-path hardening is a separate concern from this escape hatch.
   *
   * Note this is a denylist, which is exactly the mechanism rejected for the primary filter. It is
   * sound *here* because it is not the boundary: the allowlist still is. This only bounds how far
   * an operator (or someone who has taken over their config file) can extend that allowlist, so
   * failing open means an explicitly-named variable gets through rather than an unknown one.
   */
  private static readonly NEVER_PASSTHROUGH_NAMES: readonly string[] = [
    // loader / interpreter hooks
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'LD_AUDIT',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'DYLD_FRAMEWORK_PATH',
    'NODE_OPTIONS',
    'BASH_ENV',
    'ENV',
    'SHELLOPTS',
    'BASHOPTS',
    'PS4',
    'PYTHONPATH',
    'PYTHONSTARTUP',
    'PERL5LIB',
    'PERL5OPT',
    'RUBYOPT',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'GIT_EXTERNAL_DIFF',
    'GIT_PAGER',
    'PAGER',
    'EDITOR',
    'VISUAL',
    'KUBE_EDITOR',
    // TLS trust overrides
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'CURL_CA_BUNDLE',
    'NODE_EXTRA_CA_CERTS',
    'REQUESTS_CA_BUNDLE',
    'AWS_CA_BUNDLE',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    // credential and endpoint redirection
    'AWS_ENDPOINT_URL',
    'AWS_CONFIG_FILE',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AZURE_CLIENT_SECRET',
  ];

  /**
   * Name *prefixes* an operator may never add, for families where blocking exact names is not
   * enough.
   *
   * `AWS_ENDPOINT_URL` is the motivating case: the AWS SDKs also honour per-service overrides of
   * the form `AWS_ENDPOINT_URL_<SERVICE>`, and `AWS_ENDPOINT_URL_STS` takes precedence over the
   * global setting. Refusing only the exact name would leave the EKS credential flow — the very
   * thing {@link CLOUD_AUTHENTICATION_ALLOWLIST} exists to enable — redirectable to an attacker
   * STS endpoint by a one-line config entry.
   *
   * The loader families are covered by prefix for the same reason: `LD_*` and `DYLD_*` are
   * reserved by the dynamic linkers and no member of either is ever needed by a Solo subprocess.
   */
  private static readonly NEVER_PASSTHROUGH_PREFIXES: readonly string[] = ['AWS_ENDPOINT_URL', 'LD_', 'DYLD_'];

  /**
   * Operator-supplied extra names from `subprocess.additionalEnvironmentVariables`, once vetted,
   * keyed by the command profile they were declared for.
   *
   * Per-profile rather than global: a variable added because an exec credential plugin needs it
   * has no business reaching `npm`, `brew` or a container engine, and flattening the list would
   * discard exactly the per-command containment this allowlist exists to provide.
   */
  private static operatorAllowlist: Partial<Record<SubprocessCommandProfile, readonly string[]>> = {};

  /**
   * Records the operator-configured extra variable names per command profile, dropping any that
   * {@link NEVER_PASSTHROUGH_NAMES} refuses.
   *
   * @param requestedNamesByProfile - exact names read from the config file, keyed by profile
   * @param onNamesRefused - invoked with the refused `profile:NAME` entries so the caller can
   *   warn; a silently ignored security setting is worse than none
   * @returns the accepted names, keyed by profile
   */
  public static configureOperatorAllowlist(
    requestedNamesByProfile: Partial<Record<SubprocessCommandProfile, readonly string[]>>,
    onNamesRefused?: (refusedEntries: string[]) => void,
  ): Partial<Record<SubprocessCommandProfile, readonly string[]>> {
    const refused: string[] = [];
    const accepted: Partial<Record<SubprocessCommandProfile, readonly string[]>> = {};

    for (const [profile, requestedNames] of Object.entries(requestedNamesByProfile ?? {})) {
      const acceptedForProfile: string[] = [];
      for (const name of requestedNames ?? []) {
        const trimmed: string = name.trim();
        if (trimmed.length === 0) {
          continue;
        }
        const upperCased: string = trimmed.toUpperCase();
        const isRefused: boolean =
          SubprocessEnvironment.NEVER_PASSTHROUGH_NAMES.some(
            (forbidden: string): boolean => forbidden.toUpperCase() === upperCased,
          ) ||
          SubprocessEnvironment.NEVER_PASSTHROUGH_PREFIXES.some((prefix: string): boolean =>
            upperCased.startsWith(prefix.toUpperCase()),
          );
        if (isRefused) {
          refused.push(`${profile}:${trimmed}`);
        } else {
          acceptedForProfile.push(trimmed);
        }
      }
      if (acceptedForProfile.length > 0) {
        accepted[profile as SubprocessCommandProfile] = acceptedForProfile;
      }
    }

    SubprocessEnvironment.operatorAllowlist = accepted;
    if (onNamesRefused && refused.length > 0) {
      onNamesRefused(refused);
    }
    return accepted;
  }

  /**
   * Returns the already-vetted operator-configured names for a profile.
   *
   * Exists so a spawned worker that runs in its own process — and therefore starts with an empty
   * {@link operatorAllowlist} of its own — can be handed the parent's accepted names (e.g. as a
   * CLI argument) and re-seed them via {@link configureOperatorAllowlist} before it re-derives its
   * own environment with {@link forCommand}. Without this, a worker's independent filtering step
   * silently drops names the operator configured, even though the parent already accepted them.
   *
   * @param profile - the command profile to read accepted names for
   * @returns the accepted names for that profile, or an empty array when none were configured
   */
  public static getOperatorAllowlist(profile: SubprocessCommandProfile): readonly string[] {
    return SubprocessEnvironment.operatorAllowlist[profile] ?? [];
  }

  /**
   * Renders withheld variable names as one or more bounded log lines.
   *
   * Environment variable *names* come from the parent process and are not otherwise constrained —
   * on POSIX a name may contain newlines or other control characters, and there is no length
   * bound. Writing them verbatim into `solo.log` would let a poisoned environment forge log lines
   * or inflate the file. Names are therefore restricted to a conservative identifier shape.
   *
   * Every conforming name is emitted, chunked across lines rather than truncated at the first
   * {@link MAXIMUM_NAMES_PER_LINE}: the documented workflow is for a user to search `solo.log`
   * for their variable, and a cap that silently drops names beyond a threshold would make that
   * search quietly unreliable — worse than no diagnostic, because it reads as an answer. A total
   * ceiling still applies so a pathological environment cannot flood the log.
   *
   * @param names - sorted withheld variable names
   * @returns bounded, printable lines safe to embed in log output
   */
  public static renderWithheldNames(names: readonly string[]): string[] {
    const printable: string[] = [];
    let unprintableCount: number = 0;
    for (const name of names) {
      if (/^[\w.()-]{1,64}$/.test(name)) {
        printable.push(name);
      } else {
        unprintableCount++;
      }
    }

    const retained: string[] = printable.slice(0, SubprocessEnvironment.MAXIMUM_NAMES_LOGGED);
    const droppedCount: number = printable.length - retained.length;

    const lines: string[] = [];
    for (let offset: number = 0; offset < retained.length; offset += SubprocessEnvironment.MAXIMUM_NAMES_PER_LINE) {
      lines.push(retained.slice(offset, offset + SubprocessEnvironment.MAXIMUM_NAMES_PER_LINE).join(', '));
    }
    if (lines.length === 0) {
      lines.push('');
    }

    const notes: string[] = [];
    if (droppedCount > 0) {
      notes.push(`${droppedCount} further name(s) omitted`);
    }
    if (unprintableCount > 0) {
      notes.push(`${unprintableCount} with non-identifier names omitted`);
    }
    if (notes.length > 0) {
      lines.push(`(${notes.join('; ')})`);
    }
    return lines;
  }

  /** Upper bound on how many names a single log line may list. */
  private static readonly MAXIMUM_NAMES_PER_LINE: number = 100;

  /** Ceiling on names logged in total, so a pathological environment cannot flood the log. */
  private static readonly MAXIMUM_NAMES_LOGGED: number = 2000;

  /**
   * Receives the sorted names of variables withheld from a command, at most once per profile per
   * process. Set once during startup; unset in the standalone `persist-port-forward` script, which
   * has no logger.
   *
   * A single sink rather than a per-call callback because the reporting is cross-cutting: there are
   * nine call sites, and threading a parameter through each one guaranteed the ones that were
   * missed (direct `kubectl` spawns in `K8ClientContainer` and port forwarding) would silently
   * filter the environment with no diagnostic.
   */
  private static withheldReporter: ((profile: SubprocessCommandProfile, withheldNames: string[]) => void) | undefined;

  /**
   * Installs the diagnostic sink that reports withheld variable names.
   *
   * @param reporter - receives the profile and the sorted withheld names; names only, never values
   */
  public static configureWithheldReporter(
    reporter: (profile: SubprocessCommandProfile, withheldNames: string[]) => void,
  ): void {
    SubprocessEnvironment.withheldReporter = reporter;
  }

  /**
   * Command profiles whose withheld-variable list has already been reported in this process.
   *
   * A Solo run spawns hundreds of subprocesses and a normal developer or CI environment holds
   * 80+ variables that no external command needs, so reporting on every invocation would add
   * tens of thousands of lines to `solo.log`. The set of withheld names is a pure function of
   * the profile and the parent environment, neither of which changes during a run, so reporting
   * once per profile loses nothing and bounds the output at one line per profile.
   */
  private static readonly reportedProfiles: Set<SubprocessCommandProfile> = new Set<SubprocessCommandProfile>();

  /**
   * Clears the once-per-profile reporting memo. Exists so tests can assert reporting behaviour
   * independently of execution order; not used in production code.
   */
  public static resetWithheldReporting(): void {
    SubprocessEnvironment.reportedProfiles.clear();
    SubprocessEnvironment.withheldReporter = undefined;
  }

  /** Exact variable names allowed in addition to the common base set, per command profile. */
  private static readonly COMMAND_ALLOWLIST: Record<SubprocessCommandProfile, readonly string[]> = {
    [SubprocessCommandProfile.GENERIC]: [],
    [SubprocessCommandProfile.KUBECTL]: [
      'KUBECONFIG',
      'KUBERNETES_SERVICE_HOST',
      'KUBERNETES_SERVICE_PORT',
      ...SubprocessEnvironment.CLOUD_AUTHENTICATION_ALLOWLIST,
    ],
    // DOCKER_CONFIG: helm consults the Docker/OCI registry credential file
    // ($DOCKER_CONFIG/config.json) when pulling OCI charts.
    [SubprocessCommandProfile.HELM]: [
      'KUBECONFIG',
      'DOCKER_CONFIG',
      ...SubprocessEnvironment.CLOUD_AUTHENTICATION_ALLOWLIST,
    ],
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
   *
   *   Withheld variable names are reported through {@link configureWithheldReporter}, at most once
   *   per profile per process. An allowlist fails closed *and silently*, which is what made #5895
   *   expensive to diagnose: the reporter had to replace the `helm` binary with a recorder to find
   *   that `AWS_ROLE_ARN` was being dropped. The list is deliberately unfiltered — a heuristic for
   *   "interesting" names would hide exactly the user-defined variable someone is looking for —
   *   and carries names only, never values.
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
        // Operator-configured extras for this profile, already vetted by
        // configureOperatorAllowlist(). Scoped per profile so they do not leak to other commands.
        ...(SubprocessEnvironment.operatorAllowlist[profile] ?? []),
      ].map((name: string): string => normalize(name)),
    );
    const allowedPrefixes: readonly string[] = (SubprocessEnvironment.COMMAND_PREFIX_ALLOWLIST[profile] ?? []).map(
      (prefix: string): string => normalize(prefix),
    );

    const withheldNames: string[] = [];

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
      } else if (!Object.hasOwn(overrides, name)) {
        withheldNames.push(name);
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

    if (
      SubprocessEnvironment.withheldReporter &&
      withheldNames.length > 0 &&
      !SubprocessEnvironment.reportedProfiles.has(profile)
    ) {
      SubprocessEnvironment.reportedProfiles.add(profile);
      // Sorted in place (tsconfig lib is ES2022, so toSorted() is unavailable) for stable,
      // diffable log output across runs.
      withheldNames.sort();
      SubprocessEnvironment.withheldReporter(profile, withheldNames);
    }

    return {...environment, ...overrides};
  }
}
