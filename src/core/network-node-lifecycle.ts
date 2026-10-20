// SPDX-License-Identifier: Apache-2.0

import * as constants from './constants.js';
import * as versions from '../../version.js';
import {K8Helper} from '../business/utils/k8-helper.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type Container} from '../integration/kube/resources/container/container.js';
import {type Context} from '../types/index.js';
import {type NodeAlias} from '../types/aliases.js';
import {SoloErrors} from './errors/solo-errors.js';

/**
 * Builds the shell commands Solo runs in the root container to control the consensus node process.
 *
 * Two images are supported, selected by the NETWORK_NODE_LIFECYCLE_MODE environment variable:
 *  - `solo-container` (default): solo-containers `debian-s6-java25`, controlled by its
 *    `/command/network-node-lifecycle` helper.
 *  - `consensus-node-image`: the hiero-consensus-node deterministic image, which runs the node as a single
 *    s6 `consensus` service controlled with `s6-svc` and never auto-starts (AUTO_START_CONSENSUS_SERVICE=false).
 */
export class NetworkNodeLifecycle {
  public static readonly SOLO_CONTAINER_MODE: string = 'solo-container';
  public static readonly CONSENSUS_NODE_IMAGE_MODE: string = 'consensus-node-image';

  private static readonly SOLO_CONTAINER_HELPER_PATH: string = '/command/network-node-lifecycle';
  private static readonly S6_SERVICE_CONTROL_PATH: string = '/command/s6-svc';
  private static readonly CONSENSUS_SERVICE_PATH: string = '/run/service/consensus';
  private static readonly SERVICE_STOP_TIMEOUT_MILLISECONDS: number = 60_000;
  private static readonly JVM_STOP_ATTEMPTS: number = 60;
  // matches only the java process, not shells whose command line merely contains the main class name; Browser is the
  // main class Solo selects with JAVA_MAIN_CLASS when --app is not the default HederaNode.jar
  private static readonly JVM_PIDS_FUNCTION: string = String.raw`jvm_pids() { for p in /proc/[0-9]*; do tr '\0' ' ' < "$p/cmdline" 2>/dev/null | grep -qE '^java .*(com.hedera.node.app.ServicesMain|com.swirlds.platform.Browser)' && basename "$p"; done; }`;

  public static isConsensusNodeImage(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): boolean {
    const acceptedModes: string[] = [
      NetworkNodeLifecycle.SOLO_CONTAINER_MODE,
      NetworkNodeLifecycle.CONSENSUS_NODE_IMAGE_MODE,
    ];
    if (!acceptedModes.includes(mode)) {
      throw new SoloErrors.validation.invalidNetworkNodeLifecycleMode(mode, acceptedModes);
    }
    return mode === NetworkNodeLifecycle.CONSENSUS_NODE_IMAGE_MODE;
  }

  /** Command used by `consensus node start` to (re)start the node process. */
  public static buildStartCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    if (NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      return NetworkNodeLifecycle.buildConsensusNodeImageStartCommand();
    }

    const helperPath: string = NetworkNodeLifecycle.SOLO_CONTAINER_HELPER_PATH;
    return [
      // Fail fast when the helper is missing so callers immediately know the image
      // does not satisfy Solo's lifecycle contract.
      `test -x "${helperPath}" || { echo "missing ${helperPath}; update solo-container image" >&2; exit 1; }`,
      [
        "if ps -ef | grep -q '[c]om.hedera.node.app.ServicesMain'",
        "then curl -sf http://localhost:9999/metrics | grep 'platform_PlatformStatus' | grep -q ' 2[.]0$' && true < /dev/tcp/127.0.0.1/50211",
        'else false',
        'fi',
      ].join('\n'),
      // ACTIVE nodes only need the autostart marker restored; the full helper start
      // path deliberately forces a down/up cycle for transitional or frozen nodes.
      `if [ $? -eq 0 ]; then "${helperPath}" enable-autostart; exit 0; fi`,
      // A JVM can remain alive with only background threads after the main platform
      // exits. Clear any non-ready process before asking the helper to start it.
      `"${helperPath}" stop-and-disable-autostart`,
      // The helper owns both service control and autostart marker semantics.
      `"${helperPath}" start-and-enable-autostart`,
    ].join('\n');
  }

  /**
   * Start command for the consensus node image. That image has no ps or pgrep, and none of solo-containers'
   * startup staging, so the JVM is found through /proc, and the files that solo-containers' stage_files.sh
   * links or copies into the application directory are staged here before the service starts.
   */
  private static buildConsensusNodeImageStartCommand(): string {
    const serviceControl: string = NetworkNodeLifecycle.S6_SERVICE_CONTROL_PATH;
    const servicePath: string = NetworkNodeLifecycle.CONSENSUS_SERVICE_PATH;
    const applicationDirectory: string = constants.HEDERA_HAPI_PATH;

    return [
      `test -x "${serviceControl}" || { echo "missing ${serviceControl}; update the consensus node image" >&2; exit 1; }`,
      // A restarted container loses the tools installed earlier in its writable layer, and the status checks that follow
      // a start read the node metrics with curl, so make sure they are present on every start.
      NetworkNodeLifecycle.buildInstallToolsCommand(),
      // log4j2.xml and settings.txt come from the hapi-app config map; hedera.crt and hedera.key from the secrets
      `for file_path in /etc/network-node/config/*; do [ -e "$file_path" ] || break; ln -sf "$file_path" "${applicationDirectory}/$(basename "$file_path")"; done`,
      `if [ -d /shared-hapiapp ] && [ -n "$(ls -A /shared-hapiapp)" ]; then cp -f /shared-hapiapp/* "${applicationDirectory}/"; fi`,
      // The image entrypoint requires genesis-network.json, but Solo only copies it at genesis. Nodes added later start
      // from a downloaded state and never read it, so an empty placeholder is enough to let the entrypoint proceed.
      `[ -s "${applicationDirectory}/data/config/genesis-network.json" ] || echo '{}' > "${applicationDirectory}/data/config/genesis-network.json"`,
      NetworkNodeLifecycle.JVM_PIDS_FUNCTION,
      // ACTIVE nodes are left running. A JVM that is alive but not ACTIVE is stopped first.
      'if [ -n "$(jvm_pids)" ]; then',
      "  if curl -s http://localhost:9999/metrics | grep 'platform_PlatformStatus' | grep -q ' 2[.]0$'; then exit 0; fi",
      'fi',
      ...NetworkNodeLifecycle.buildStopServiceCommands(),
      `"${serviceControl}" -o "${servicePath}"`,
    ].join('\n');
  }

  /**
   * Stops the s6 consensus service and then the JVM itself. `s6-svc -d` only stops the supervised entrypoint; the
   * JVM it launched survives as an orphan, so it is terminated (then killed) here. Without ps/pkill in the image the
   * JVM is found through /proc.
   */
  private static buildStopServiceCommands(): string[] {
    return [
      `"${NetworkNodeLifecycle.S6_SERVICE_CONTROL_PATH}" -wD -T ${NetworkNodeLifecycle.SERVICE_STOP_TIMEOUT_MILLISECONDS} -d "${NetworkNodeLifecycle.CONSENSUS_SERVICE_PATH}"`,
      'running_pids="$(jvm_pids)"',
      'if [ -n "$running_pids" ]; then',
      '  kill -TERM $running_pids',
      `  for attempt in $(seq 1 ${NetworkNodeLifecycle.JVM_STOP_ATTEMPTS}); do [ -z "$(jvm_pids)" ] && break; sleep 1; done`,
      '  running_pids="$(jvm_pids)"',
      '  if [ -n "$running_pids" ]; then kill -KILL $running_pids; sleep 1; fi',
      'fi',
    ];
  }

  /** Command used by `consensus node stop` to stop the node process. */
  public static buildStopCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    if (NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      const serviceControl: string = NetworkNodeLifecycle.S6_SERVICE_CONTROL_PATH;
      return [
        `test -x "${serviceControl}" || { echo "missing ${serviceControl}; update the consensus node image" >&2; exit 1; }`,
        NetworkNodeLifecycle.JVM_PIDS_FUNCTION,
        ...NetworkNodeLifecycle.buildStopServiceCommands(),
      ].join('\n');
    }

    const helperPath: string = NetworkNodeLifecycle.SOLO_CONTAINER_HELPER_PATH;
    return [
      `test -x "${helperPath}" || { echo "missing ${helperPath}; update solo-container image" >&2; exit 1; }`,
      // Keep Solo orchestration-only: hard-stop and escalation logic must stay in
      // solo-container's /command/network-node-lifecycle helper.
      `"${helperPath}" stop-and-disable-autostart`,
    ].join('\n');
  }

  /**
   * Command used before killing a pod so it does not start the node on restart before new config is staged.
   * The consensus node image never auto-starts (AUTO_START_CONSENSUS_SERVICE=false), so nothing is needed there.
   */
  public static buildDisableAutostartCommand(mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE): string {
    if (NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      return 'true';
    }
    const helperPath: string = NetworkNodeLifecycle.SOLO_CONTAINER_HELPER_PATH;
    return `test -x "${helperPath}" && "${helperPath}" disable-autostart`;
  }

  /**
   * Helm values (relative to `defaults`) for the released consensus node image of the given release tag, or
   * undefined when the solo-container image is used: the root container image, and `appJarsInImage` so the chart
   * does not mount empty data/lib and data/apps volumes over the jar files baked into that image.
   */
  public static buildDefaultsValues(
    releaseTag: string,
    mode: string = constants.NETWORK_NODE_LIFECYCLE_MODE,
  ):
    | {
        root: {image: {registry: string; repository: string; tag: string; pullPolicy: string}};
        volumeClaims: {appJarsInImage: boolean};
      }
    | undefined {
    if (!NetworkNodeLifecycle.isConsensusNodeImage(mode)) {
      return undefined;
    }
    return {
      root: {
        image: {
          registry: constants.CONSENSUS_NODE_IMAGE_REGISTRY,
          repository: constants.CONSENSUS_NODE_IMAGE_REPOSITORY,
          tag: (releaseTag || versions.HEDERA_PLATFORM_VERSION).replace(/^v/, ''),
          pullPolicy: 'IfNotPresent',
        },
      },
      volumeClaims: {appJarsInImage: true},
    };
  }

  /**
   * Installs zip, unzip and curl in the root container when any is missing. The consensus node image ships without
   * them, but Solo uses zip and unzip to archive, extract and verify node state and platform archives, and curl to read
   * the node metrics. The image's hedera user has passwordless sudo.
   *
   * The tools are installed at runtime, rather than baked into the image, because this is the upstream image built from
   * the hiero-consensus-node repository, which is the same image used in mainnet production. Solo cannot change its
   * contents, so adding tools to the image is not an option.
   */
  public static buildInstallToolsCommand(): string {
    return (
      'command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 || ' +
      // the image build deletes /var/cache and /var/log, and apt refuses to run without its working directories
      '(sudo mkdir -p /var/cache/apt/archives/partial /var/lib/apt/lists/partial /var/log/apt && ' +
      'sudo apt-get update -qq && ' +
      'sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends zip unzip curl)'
    );
  }

  /** Runs {@link buildInstallToolsCommand} in the root container of the given consensus node's pod. */
  public static async installRootContainerTools(
    context: Context,
    namespace: NamespaceName,
    nodeAlias: NodeAlias,
  ): Promise<void> {
    await NetworkNodeLifecycle.installToolsInContainer(
      await new K8Helper(context).getConsensusNodeRootContainer(namespace, nodeAlias),
    );
  }

  /** Runs {@link buildInstallToolsCommand} in the given root container. */
  public static async installToolsInContainer(container: Container): Promise<void> {
    await container.execContainer(['bash', '-c', NetworkNodeLifecycle.buildInstallToolsCommand()]);
  }

  /**
   * Gives the hedera user ownership of a path inside the root container. Only root can change ownership; the consensus
   * node image already runs as hedera, so the files it extracts or copies are its own.
   */
  public static buildChangeOwnerCommand(path: string): string {
    return `if [ "$(id -u)" = "0" ]; then chown -R hedera:hedera ${path}; fi`;
  }
}
