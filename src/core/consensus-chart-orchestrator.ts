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
import {type ConsensusChartAddress} from './consensus-chart-address.js';
import {type ConsensusChartTarget} from './consensus-chart-target.js';
import {type ConsensusChartDeltaPlan} from './consensus-chart-delta-plan.js';

/**
 * How a failed upgrade is retried.
 *
 * `CLEAN_RETRY` uninstalls the release before retrying, which is only safe on a first deploy, where
 * nothing of value is installed. On a live network it would uninstall the shared release on a
 * transient error, taking the MinIO tenant and its credentials with it; the next install mints fresh
 * credentials that do not match the tenant's existing volume, which is unrecoverable.
 */
export enum RetryPolicy {
  CLEAN_RETRY = 'clean-retry',
  RETRY_ONLY = 'retry-only',
}

/**
 * Installs, upgrades and removes the Helm releases that make up a consensus network, in whichever
 * layout the namespace is already in — one umbrella `solo-deployment` release, or a shared release
 * plus one `consensus-node-<alias>` release per node. Both render the same objects, so anything that
 * addresses nodes by name or label works either way; only code that drives Helm needs the layout.
 */
@injectable()
export class ConsensusChartOrchestrator {
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

  /** Sourced from `resources/config/helm-chart-config.yaml` so a renamed chart needs no code change. */
  public get sharedReleaseName(): string {
    return Templates.resolveConsensusChartName(this.soloConfig.helmChart.name);
  }

  private cacheKey(namespace: NamespaceName, kubeContext: Context): string {
    return `${kubeContext}\u0000${namespace.name}`;
  }

  /**
   * The layout of a namespace, from the releases Helm reports.
   *
   * Cached for the life of the process because `one-shot` runs many subcommands per invocation.
   * There is deliberately no TTL: only this class changes a layout and every mutating method
   * refreshes its own entry, so a time-based expiry could only ever serve a stale answer.
   */
  public async discover(address: ConsensusChartAddress): Promise<ConsensusChartLayout> {
    const key: string = this.cacheKey(address.namespace, address.kubeContext);
    const cached: ConsensusChartLayout | undefined = this.layoutCache.get(key);
    if (cached) {
      return cached;
    }

    let releases: ReleaseItem[];
    try {
      releases = await this.chartManager.getInstalledReleases(address.namespace, address.kubeContext);
    } catch {
      // A namespace that does not exist yet has no releases; that is NONE, not an error.
      releases = [];
    }

    const layout: ConsensusChartLayout = ConsensusChartLayout.classify(releases, this.sharedReleaseName);

    // Said once per namespace on the cache miss, so an operator who exports the flag and sees nothing
    // change on an existing deployment is told why rather than concluding it is broken.
    if (layout.kind === ConsensusChartLayoutKind.UMBRELLA && constants.CONFIG.EXPERIMENTAL_PER_CONSENSUS_NODE_CHART) {
      this.logger.showUser(
        `Deployment in namespace ${address.namespace} uses the single ${this.sharedReleaseName} chart. ` +
          'EXPERIMENTAL_PER_CONSENSUS_NODE_CHART applies to new deployments only; this one is unchanged.',
      );
    }

    this.layoutCache.set(key, layout);
    return layout;
  }

  /**
   * Drops every cached layout. Used by tests, which share one container across cases that each
   * deploy and destroy, and so would otherwise read the previous case's layout.
   */
  public invalidateAll(): void {
    this.layoutCache.clear();
  }

  private invalidate(namespace: NamespaceName, kubeContext: Context): void {
    this.layoutCache.delete(this.cacheKey(namespace, kubeContext));
  }

  /** Re-reads and re-caches the layout after this class has changed it. */
  private async refresh(address: ConsensusChartAddress): Promise<ConsensusChartLayout> {
    this.invalidate(address.namespace, address.kubeContext);
    return this.discover(address);
  }

  private chartRepository(target: ConsensusChartTarget): string {
    return target.chartDirectory || SoloChartRepository.resolveUrl(target.soloChartVersion);
  }

  /**
   * Renders a whole network, replacing whatever is there.
   *
   * Under the umbrella layout `chartValues` reaches Helm exactly as the caller built it. Translating
   * it would mean parsing `--set`/`--values` into an object and re-emitting one YAML file, and that
   * round-trip is not faithful — Helm reads YAML 1.1, applies its own `--set` escaping rules and
   * errors on a missing `--set-file` where the translator substitutes an empty string. Keeping the
   * caller's arguments is what makes an unchanged deployment render byte-identically to before the
   * split chart existed. Only the split layout, which no existing deployment uses, is translated.
   *
   * @param splitLayout - render as one release per node rather than a single umbrella release.
   * @param retryPolicy - see {@link RetryPolicy}; only a first deploy may pass `CLEAN_RETRY`.
   */
  public async renderNetwork(
    target: ConsensusChartTarget,
    chartValues: HelmChartValues,
    nodeAliases: readonly NodeAlias[],
    splitLayout: boolean,
    retryPolicy: RetryPolicy,
  ): Promise<void> {
    // Enforced rather than left to the caller: a CLEAN_RETRY against a namespace that already holds
    // releases would uninstall the shared release on a transient error and take the MinIO tenant's
    // credentials with it. Only a first deploy — nothing installed — may ask for it.
    if (retryPolicy === RetryPolicy.CLEAN_RETRY) {
      const existing: ConsensusChartLayout = await this.discover(target);
      if (existing.isDeployed()) {
        throw new SoloErrors.validation.illegalArgument(
          `refusing CLEAN_RETRY against the existing deployment in ${target.namespace}; use RETRY_ONLY`,
        );
      }
    }

    if (!splitLayout) {
      await this.upgradeShared(target, chartValues, false, true, retryPolicy);
      await this.refresh(target);
      return;
    }

    const umbrella: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments(chartValues.toArguments());

    // The per-node chart mounts nine ConfigMaps and Secrets the shared release renders, so the
    // shared half has to exist before any node release starts.
    await this.upgradeShared(
      target,
      this.valuesFile(target, 'shared', ConsensusNodeValuesTranslator.toSharedValues(umbrella)),
      false,
      true,
      retryPolicy,
    );

    for (const nodeAlias of nodeAliases) {
      await this.upgradeNode(target, nodeAlias, nodeAlias, umbrella, false, retryPolicy);
    }

    await this.refresh(target);
  }

  /**
   * Applies a partial change to an existing network, preserving everything the releases already hold.
   *
   * The delta is umbrella-shaped — the node-lifecycle value builders produce it that way — and is
   * translated per release rather than reconstructed into a full values set. Reconstruction would be
   * wrong: these call sites deliberately pass only the keys they are changing, so a rebuilt
   * "umbrella" has no `defaults.*` or `cloud.*` and would render a node from chart defaults.
   * `--reuse-values` supplies the rest, which is why the delta must stay a delta.
   *
   * As in {@link renderNetwork}, the umbrella layout passes `chartValues` through untouched; only a
   * split layout is translated.
   */
  public async applyDelta(
    target: ConsensusChartTarget,
    chartValues: HelmChartValues,
    plan: ConsensusChartDeltaPlan,
  ): Promise<void> {
    const layout: ConsensusChartLayout = await this.discover(target);

    if (!layout.isSplit()) {
      // One release holds everything, so the delta applies unchanged. `install` stays false: these
      // are node-lifecycle upgrades against a release that must already exist, and `--install` plus
      // `--reuse-values` on a missing release would silently build a network from chart defaults
      // and this delta alone.
      if (plan.shared === 'upgrade' || plan.nodes.length > 0) {
        await this.upgradeShared(target, chartValues, true, false, RetryPolicy.RETRY_ONLY);
      }
      return;
    }

    const umbrellaDelta: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments(chartValues.toArguments());

    // Uninstalls run first so a removed node is gone before the roster shrinks; the shared release
    // then re-renders `dns-validation-script` without it. The reverse order would leave every later
    // pod restart waiting on a DNS name that no longer resolves.
    for (const {alias} of plan.nodes.filter((node): boolean => node.action === 'uninstall')) {
      await this.chartManager.uninstall(
        target.namespace,
        ConsensusChartLayout.perNodeReleaseName(alias),
        target.kubeContext,
      );
    }

    if (plan.shared === 'upgrade') {
      await this.upgradeShared(
        target,
        this.valuesFile(target, 'shared-delta', ConsensusNodeValuesTranslator.toSharedValues(umbrellaDelta)),
        true,
        true,
        RetryPolicy.RETRY_ONLY,
      );
    }

    for (const {alias, action} of plan.nodes) {
      if (action === 'uninstall') {
        continue;
      }

      // A node being added has no release to reuse values from.
      await this.upgradeNode(
        target,
        alias,
        `${alias}-delta`,
        umbrellaDelta,
        action === 'upgrade',
        RetryPolicy.RETRY_ONLY,
      );
    }

    await this.refresh(target);
  }

  /** Removes the shared release and every per-node release, whichever layout produced them. */
  public async uninstallAll(address: ConsensusChartAddress): Promise<string[]> {
    const layout: ConsensusChartLayout = await this.discover(address);
    const removed: string[] = [];

    for (const releaseName of layout.allNodeReleaseNames()) {
      await this.chartManager.uninstall(address.namespace, releaseName, address.kubeContext);
      removed.push(releaseName);
    }

    if (layout.sharedReleaseInstalled) {
      await this.chartManager.uninstall(address.namespace, this.sharedReleaseName, address.kubeContext);
      removed.push(this.sharedReleaseName);
    }

    this.invalidate(address.namespace, address.kubeContext);
    return removed;
  }

  /** Serialises translated values to a file beside the generated profile values; split layout only. */
  private valuesFile(target: ConsensusChartTarget, name: string, values: AnyObject): HelmChartValues {
    return new HelmChartValues().file(
      ConsensusNodeValuesTranslator.writeValuesFile(
        PathEx.join(target.cacheDirectory, 'split-charts', target.clusterReference),
        `${name}-values.yaml`,
        values,
      ),
    );
  }

  private upgradeShared(
    target: ConsensusChartTarget,
    chartValues: HelmChartValues,
    reuseValues: boolean,
    install: boolean,
    retryPolicy: RetryPolicy,
  ): Promise<void> {
    return this.upgradeRelease(
      target,
      this.sharedReleaseName,
      this.sharedReleaseName,
      chartValues,
      reuseValues,
      install,
      retryPolicy,
    );
  }

  private upgradeNode(
    target: ConsensusChartTarget,
    nodeAlias: NodeAlias,
    valuesName: string,
    umbrella: AnyObject,
    reuseValues: boolean,
    retryPolicy: RetryPolicy,
  ): Promise<void> {
    return this.upgradeRelease(
      target,
      ConsensusChartLayout.perNodeReleaseName(nodeAlias),
      constants.CONSENSUS_NODE_CHART,
      this.valuesFile(target, valuesName, ConsensusNodeValuesTranslator.toNodeValues(umbrella, nodeAlias)),
      reuseValues,
      true,
      retryPolicy,
    );
  }

  /** Upgrades one release with bounded retries to ride out transient API server outages. */
  private async upgradeRelease(
    target: ConsensusChartTarget,
    releaseName: string,
    chartName: string,
    chartValues: HelmChartValues,
    reuseValues: boolean,
    install: boolean,
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
          install,
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
