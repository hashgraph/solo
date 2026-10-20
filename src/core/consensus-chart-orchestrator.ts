// SPDX-License-Identifier: Apache-2.0

import {inject, injectable} from 'tsyringe-neo';

import * as constants from './constants.js';
import {Templates} from './templates.js';
import {ConsensusChartLayout, ConsensusChartLayoutKind} from './consensus-chart-layout.js';
import {ConsensusNodeValuesTranslator} from './consensus-node-values-translator.js';
import {SoloChartRepository} from './solo-chart-repository.js';
import {SoloErrors} from './errors/solo-errors.js';
import {Duration} from './time/duration.js';
import {sleep} from './helpers.js';
import {patchInject} from './dependency-injection/container-helper.js';
import {InjectTokens} from './dependency-injection/inject-tokens.js';
import {type ChartManager} from './chart-manager.js';
import {type SoloLogger} from './logging/solo-logger.js';
import {type ConfigProvider} from '../data/configuration/api/config-provider.js';
import {SoloConfig} from '../business/runtime-state/config/solo/solo-config.js';
import {HelmChartValues} from '../integration/helm/model/values.js';
import {type ReleaseItem} from '../integration/helm/model/release/release-item.js';
import {type NamespaceName} from '../types/namespace/namespace-name.js';
import {type AnyObject, type NodeAlias} from '../types/aliases.js';
import {type Context} from '../types/index.js';
import {PathEx} from '../business/utils/path-ex.js';
import {type ConsensusChartTarget} from './consensus-chart-target.js';
import {type ConsensusChartDeltaPlan} from './consensus-chart-delta-plan.js';

/**
 * How a failed upgrade is retried.
 *
 * `CLEAN_RETRY` uninstalls the release before retrying, which is only safe when nothing of value is
 * installed — i.e. a first deploy, which the existing-deployment probe has already established.
 * Using it on a live network would uninstall the shared release on a transient error, taking the
 * MinIO tenant and its credentials with it; the next install mints fresh credentials that do not
 * match the tenant's existing volume, which is unrecoverable.
 */
export enum RetryPolicy {
  CLEAN_RETRY = 'clean-retry',
  RETRY_ONLY = 'retry-only',
}

/**
 * Installs, upgrades and removes the Helm releases that make up a consensus network, in whichever
 * layout the namespace is already in.
 *
 * A network is either one umbrella `solo-deployment` release or a shared release plus one
 * `consensus-node-<alias>` release per node. Both render byte-identical objects, so everything that
 * addresses nodes by name or label works either way — but anything that drives Helm has to know
 * which releases exist. Centralising that here keeps `NetworkCommand` and `NodeCommandTasks` from
 * each growing their own copy of the rule.
 */
@injectable()
export class ConsensusChartOrchestrator {
  /** Discovered layouts, keyed by context and namespace. See {@link discover} for the lifetime. */
  private readonly layoutCache: Map<string, ConsensusChartLayout> = new Map<string, ConsensusChartLayout>();

  private readonly soloConfig: SoloConfig;

  public constructor(
    @inject(InjectTokens.ChartManager) private readonly chartManager?: ChartManager,
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.ConfigProvider) private readonly configProvider?: ConfigProvider,
  ) {
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.configProvider = patchInject(configProvider, InjectTokens.ConfigProvider, this.constructor.name);
    this.soloConfig = SoloConfig.getConfig(this.configProvider);
  }

  /**
   * Name of the shared release, sourced from `resources/config/helm-chart-config.yaml` so a renamed
   * or relocated chart does not require a code change.
   */
  public get sharedReleaseName(): string {
    return Templates.resolveConsensusChartName(this.soloConfig.helmChart.name);
  }

  private cacheKey(namespace: NamespaceName, kubeContext: Context): string {
    return `${kubeContext}\u0000${namespace.name}`;
  }

  /**
   * The layout of a namespace, from the releases Helm reports.
   *
   * Cached for the life of the process because `one-shot` runs many subcommands in one invocation
   * and would otherwise re-list releases for each. There is deliberately no TTL: the only thing that
   * changes a layout is this class, and every mutating method refreshes its own entry, so a
   * time-based expiry could only ever serve a *stale* answer across a conversion. Anything that
   * changes releases behind our back calls {@link invalidate}.
   */
  public async discover(target: ConsensusChartTarget): Promise<ConsensusChartLayout> {
    const key: string = this.cacheKey(target.namespace, target.kubeContext);
    const cached: ConsensusChartLayout | undefined = this.layoutCache.get(key);
    if (cached) {
      return cached;
    }

    let releases: ReleaseItem[];
    try {
      releases = await this.chartManager.getInstalledReleases(target.namespace, target.kubeContext);
    } catch {
      // A namespace that does not exist yet has no releases; that is NONE, not an error.
      releases = [];
    }

    const layout: ConsensusChartLayout = ConsensusChartLayout.classify(releases, this.sharedReleaseName);

    // Said once per namespace and context, on the cache miss, so an operator who exports the flag
    // and sees nothing change on an existing deployment is told why rather than concluding it is
    // broken. The flag is consulted only when a deployment is first created.
    if (layout.kind === ConsensusChartLayoutKind.UMBRELLA && constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART) {
      this.logger.showUser(
        `Deployment in namespace ${target.namespace} uses the single ${this.sharedReleaseName} chart. ` +
          'EXPERIMENTAL_PER_CONSENSUS_NODE_CHART applies to new deployments only; this one is unchanged.',
      );
    }

    this.layoutCache.set(key, layout);
    return layout;
  }

  /** Drops the cached layout so the next {@link discover} re-reads the cluster. */
  public invalidate(namespace: NamespaceName, kubeContext: Context): void {
    this.layoutCache.delete(this.cacheKey(namespace, kubeContext));
  }

  /**
   * Drops every cached layout. For a caller that has changed releases across clusters without going
   * through this class, and for tests, which share one container across cases.
   */
  public invalidateAll(): void {
    this.layoutCache.clear();
  }

  /** Re-reads and re-caches the layout after this class has changed it. */
  private async refresh(target: ConsensusChartTarget): Promise<ConsensusChartLayout> {
    this.invalidate(target.namespace, target.kubeContext);
    return this.discover(target);
  }

  /** The release that owns a node's objects right now. */
  public async perNodeReleaseName(target: ConsensusChartTarget, nodeAlias: NodeAlias): Promise<string> {
    const layout: ConsensusChartLayout = await this.discover(target);
    return layout.releaseNameFor(nodeAlias, this.sharedReleaseName);
  }

  private chartRepository(target: ConsensusChartTarget): string {
    return target.chartDirectory || SoloChartRepository.resolveUrl(target.soloChartVersion);
  }

  /**
   * Renders a whole network from complete umbrella values, replacing whatever is there.
   *
   * @param splitLayout - render as one release per node rather than a single umbrella release. On a
   *   first deploy this is the caller's choice; on an existing network it must match the current
   *   layout, or {@link convertToSplit} is the operation wanted instead.
   */
  public async renderNetwork(
    target: ConsensusChartTarget,
    umbrella: AnyObject,
    nodeAliases: readonly NodeAlias[],
    splitLayout: boolean,
    retryPolicy: RetryPolicy = RetryPolicy.CLEAN_RETRY,
  ): Promise<void> {
    if (!splitLayout) {
      await this.upgradeRelease(
        target,
        this.sharedReleaseName,
        this.sharedReleaseName,
        new HelmChartValues().file(this.writeValues(target, 'umbrella', umbrella)),
        false,
        retryPolicy,
      );
      await this.refresh(target);
      return;
    }

    // The per-node chart mounts nine ConfigMaps and Secrets the shared release renders, so the
    // shared half has to exist before any node release starts.
    await this.upgradeRelease(
      target,
      this.sharedReleaseName,
      this.sharedReleaseName,
      new HelmChartValues().file(
        this.writeValues(target, 'shared', ConsensusNodeValuesTranslator.toSharedValues(umbrella)),
      ),
      false,
      retryPolicy,
    );

    for (const nodeAlias of nodeAliases) {
      await this.upgradeRelease(
        target,
        ConsensusChartLayout.perNodeReleaseName(nodeAlias),
        constants.CONSENSUS_NODE_CHART,
        new HelmChartValues().file(
          this.writeValues(target, nodeAlias, ConsensusNodeValuesTranslator.toNodeValues(umbrella, nodeAlias)),
        ),
        false,
        retryPolicy,
      );
    }

    await this.refresh(target);
  }

  /**
   * Applies a partial change to an existing network, preserving everything the releases already hold.
   *
   * The delta is umbrella-shaped — the node-lifecycle value builders produce it that way, and it is
   * translated per release rather than reconstructed into a full values set. Reconstruction would be
   * wrong: these call sites deliberately pass only the keys they are changing, so a rebuilt
   * "umbrella" has no `defaults.*` or `cloud.*` and would render a node from chart defaults.
   * `--reuse-values` is what supplies the rest, and it is why the delta must stay a delta.
   */
  public async applyDelta(
    target: ConsensusChartTarget,
    umbrellaDelta: AnyObject,
    plan: ConsensusChartDeltaPlan,
  ): Promise<void> {
    const layout: ConsensusChartLayout = await this.discover(target);

    if (!layout.isSplit()) {
      // Umbrella: one release holds everything, so the delta applies unchanged.
      if (plan.shared === 'upgrade' || plan.nodes.length > 0) {
        await this.upgradeRelease(
          target,
          this.sharedReleaseName,
          this.sharedReleaseName,
          new HelmChartValues().file(this.writeValues(target, 'umbrella-delta', umbrellaDelta)),
          true,
          RetryPolicy.RETRY_ONLY,
        );
      }
      return;
    }

    // Uninstalls run first so a removed node is gone before the roster shrinks; the shared release
    // then re-renders `dns-validation-script` without it. The reverse order would leave every later
    // pod restart waiting on a DNS name that no longer resolves.
    for (const {alias, action} of plan.nodes.filter((node): boolean => node.action === 'uninstall')) {
      void action;
      await this.chartManager.uninstall(
        target.namespace,
        ConsensusChartLayout.perNodeReleaseName(alias),
        target.kubeContext,
      );
    }

    if (plan.shared === 'upgrade') {
      await this.upgradeRelease(
        target,
        this.sharedReleaseName,
        this.sharedReleaseName,
        new HelmChartValues().file(
          this.writeValues(target, 'shared-delta', ConsensusNodeValuesTranslator.toSharedValues(umbrellaDelta)),
        ),
        true,
        RetryPolicy.RETRY_ONLY,
      );
    }

    for (const {alias, action} of plan.nodes) {
      if (action === 'uninstall') {
        continue;
      }

      await this.upgradeRelease(
        target,
        ConsensusChartLayout.perNodeReleaseName(alias),
        constants.CONSENSUS_NODE_CHART,
        new HelmChartValues().file(
          this.writeValues(target, `${alias}-delta`, ConsensusNodeValuesTranslator.toNodeValues(umbrellaDelta, alias)),
        ),
        // A node being added has no release to reuse values from.
        action === 'upgrade',
        RetryPolicy.RETRY_ONLY,
      );
    }

    await this.refresh(target);
  }

  /**
   * Converts a running umbrella deployment to one release per consensus node, in place.
   *
   * **This has no production caller, deliberately.** The single `solo-deployment` chart cannot be
   * dropped yet, so an existing deployment is never converted: it keeps the layout it was created
   * with for its whole life, and only a brand-new deployment may be created split. This method is
   * the verified path for when the single chart is finally deprecated — it is kept, and kept
   * tested, so that switch-on is a one-line change rather than a rewrite. Do not wire it into a
   * lifecycle command without that decision being made.
   *
   * The shared release is upgraded first with an emptied node list, which makes Helm release every
   * per-node object it owns; the per-node releases then recreate them under their own ownership. The
   * order is forced: Helm refuses to adopt an object another release still owns, so installing the
   * node releases first collides on every object.
   *
   * What survives, and why:
   * - the generated Secrets (`minio-secrets`, `uploader-mirror-secrets`, `haproxy-secrets`) are
   *   `lookup`-based, so re-rendering reuses the existing values rather than minting new ones — but
   *   they are also gated on `cloud.generateNewSecrets`, a deploy-time `--set` that exists in no
   *   values file. `--reuse-values` with a minimal delta is what keeps that flag true; rebuilding
   *   the shared values from scratch would drop it and Helm would *delete* the Secrets.
   * - the StatefulSets' PersistentVolumeClaims are retained by Kubernetes when a StatefulSet is
   *   deleted, and the recreated StatefulSet re-adopts them by name, so ledger state is preserved.
   *
   * Verified end-to-end against a live cluster: Secret UIDs, resourceVersions and contents unchanged,
   * all claims re-adopted with identical UIDs.
   *
   * @returns the aliases whose releases were installed.
   */
  public async convertToSplit(target: ConsensusChartTarget, nodeAliases: readonly NodeAlias[]): Promise<NodeAlias[]> {
    const layout: ConsensusChartLayout = await this.discover(target);
    if (layout.isSplit()) {
      this.logger.debug(`${target.namespace} is already split; nothing to convert`);
      return [];
    }
    if (!layout.sharedReleaseInstalled) {
      throw new SoloErrors.validation.illegalArgument(
        `cannot convert ${target.namespace}: the ${this.sharedReleaseName} release is not installed`,
      );
    }

    // Everything the running release was configured with, including the deploy-time `--set` values
    // that exist nowhere else. Fail here, before touching the cluster, if it cannot be read.
    const umbrella: AnyObject = (await this.chartManager.getReleaseValues(
      target.namespace,
      this.sharedReleaseName,
      target.kubeContext,
    )) as AnyObject;

    const known: Set<string> = new Set(ConsensusNodeValuesTranslator.nodeNames(umbrella));
    const unknown: NodeAlias[] = nodeAliases.filter((nodeAlias: NodeAlias): boolean => !known.has(nodeAlias));
    if (unknown.length > 0) {
      throw new SoloErrors.validation.illegalArgument(
        `cannot convert ${target.namespace}: the ${this.sharedReleaseName} release does not describe ` +
          `${unknown.join(', ')}; it holds ${[...known].join(', ') || 'no nodes'}`,
      );
    }

    this.logger.showUser(
      `Converting ${target.namespace} to one ${constants.CONSENSUS_NODE_CHART} release per consensus node`,
    );

    // Emptying the node list is the whole delta. `--reuse-values` carries the rest.
    await this.upgradeRelease(
      target,
      this.sharedReleaseName,
      this.sharedReleaseName,
      new HelmChartValues().file(
        this.writeValues(target, 'convert-shared', ConsensusNodeValuesTranslator.toSharedValues(umbrella)),
      ),
      true,
      RetryPolicy.RETRY_ONLY,
    );

    const installed: NodeAlias[] = [];
    for (const nodeAlias of nodeAliases) {
      try {
        await this.upgradeRelease(
          target,
          ConsensusChartLayout.perNodeReleaseName(nodeAlias),
          constants.CONSENSUS_NODE_CHART,
          new HelmChartValues().file(
            this.writeValues(
              target,
              `convert-${nodeAlias}`,
              ConsensusNodeValuesTranslator.toNodeValues(umbrella, nodeAlias),
            ),
          ),
          false,
          RetryPolicy.RETRY_ONLY,
        );
        installed.push(nodeAlias);
      } catch (error) {
        // Helm is atomic per release, never across releases, so there is no rollback that would not
        // itself collide. Every step here is idempotent, so say exactly where it stopped and let the
        // same command resume it.
        throw new SoloErrors.component.chartInstallFailed(
          `${ConsensusChartLayout.perNodeReleaseName(nodeAlias)} (${installed.length} of ${nodeAliases.length} ` +
            'consensus node releases installed; re-run to resume)',
          error,
        );
      }
    }

    await this.refresh(target);
    return installed;
  }

  /** Removes the shared release and every per-node release, whichever layout produced them. */
  public async uninstallAll(target: ConsensusChartTarget): Promise<string[]> {
    const layout: ConsensusChartLayout = await this.discover(target);
    const removed: string[] = [];

    for (const releaseName of layout.allNodeReleaseNames()) {
      await this.chartManager.uninstall(target.namespace, releaseName, target.kubeContext);
      removed.push(releaseName);
    }

    if (layout.sharedReleaseInstalled) {
      await this.chartManager.uninstall(target.namespace, this.sharedReleaseName, target.kubeContext);
      removed.push(this.sharedReleaseName);
    }

    this.invalidate(target.namespace, target.kubeContext);
    return removed;
  }

  /** Writes a values file next to the generated profile values and returns its path. */
  private writeValues(target: ConsensusChartTarget, name: string, values: AnyObject): string {
    return ConsensusNodeValuesTranslator.writeValuesFile(
      PathEx.join(target.cacheDirectory, 'split-charts', target.clusterReference),
      `${name}-values.yaml`,
      values,
    );
  }

  /**
   * Upgrades one release with bounded retries to ride out transient API server outages.
   *
   * @param retryPolicy - see {@link RetryPolicy}; only a first deploy may use `CLEAN_RETRY`.
   */
  private async upgradeRelease(
    target: ConsensusChartTarget,
    releaseName: string,
    chartName: string,
    chartValues: HelmChartValues,
    reuseValues: boolean,
    retryPolicy: RetryPolicy,
  ): Promise<void> {
    for (let attempt: number = 1; attempt <= constants.NETWORK_CHART_INSTALL_MAX_ATTEMPTS; attempt++) {
      try {
        await this.chartManager.upgrade(
          target.namespace,
          releaseName,
          chartName,
          this.chartRepository(target),
          target.soloChartVersion,
          chartValues,
          target.kubeContext,
          reuseValues,
          true,
        );
        return;
      } catch (error) {
        if (attempt === constants.NETWORK_CHART_INSTALL_MAX_ATTEMPTS) {
          throw error;
        }

        this.logger.warn(
          `Attempt ${attempt} of ${constants.NETWORK_CHART_INSTALL_MAX_ATTEMPTS} to install chart ` +
            `'${chartName}' as release '${releaseName}' failed, retrying in ` +
            `${constants.NETWORK_CHART_INSTALL_RETRY_DELAY_SECS} seconds`,
          error,
        );
        await sleep(Duration.ofSeconds(constants.NETWORK_CHART_INSTALL_RETRY_DELAY_SECS));

        if (retryPolicy === RetryPolicy.CLEAN_RETRY) {
          try {
            await this.chartManager.uninstall(target.namespace, releaseName, target.kubeContext);
          } catch (uninstallError) {
            this.logger.warn(`Could not remove the release left by the failed attempt: ${releaseName}`, uninstallError);
          }
        }
      }
    }
  }
}
