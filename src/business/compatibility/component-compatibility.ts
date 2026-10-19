// SPDX-License-Identifier: Apache-2.0

import chalk from 'chalk';
import * as versions from '../../../version.js';
import {ComponentTypes} from '../../core/config/remote/enumerations/component-types.js';
import {SoloErrors} from '../../core/errors/solo-errors.js';
import {type SoloLogger} from '../../core/logging/solo-logger.js';
import {type RemoteConfigRuntimeStateApi} from '../runtime-state/api/remote-config-runtime-state-api.js';
import {SemanticVersion} from '../utils/semantic-version.js';
import {type ComponentCompatibilityViolation} from './component-compatibility-violation.js';
import {type ComponentVersionConstraint} from './component-version-constraint.js';
import {type ComponentVersionTransition} from './component-version-transition.js';
import {type ComponentVersionTuple} from './component-version-tuple.js';

/**
 * The single source of truth for which component versions may run together and which upgrades cannot be performed
 * in place. Every command that pins a component version validates against these rules, so supporting a new
 * boundary means declaring another entry in {@link CONSTRAINTS} or {@link TRANSITIONS} rather than writing a new
 * check. Validation is pure: a tuple can be checked without deploying anything.
 */
export class ComponentCompatibility {
  public static readonly CONSTRAINTS: readonly ComponentVersionConstraint[] = [
    // The fixed 16-slot block root hash (hiero-consensus-node#26918) must be produced and verified on the same side
    // of the boundary, so this pair is declared in both directions.
    {
      when: {
        component: ComponentTypes.ConsensusNode,
        minimumVersion: versions.MINIMUM_CN_VERSION_FOR_16_SLOT_BLOCK_PROOF,
      },
      requires: {
        component: ComponentTypes.BlockNode,
        minimumVersion: versions.MINIMUM_BLOCK_NODE_VERSION_FOR_16_SLOT_BLOCK_PROOF,
      },
      reason: 'the block node must verify the fixed 16-slot block root hash the consensus node produces',
    },
    {
      when: {
        component: ComponentTypes.BlockNode,
        minimumVersion: versions.MINIMUM_BLOCK_NODE_VERSION_FOR_16_SLOT_BLOCK_PROOF,
      },
      requires: {
        component: ComponentTypes.ConsensusNode,
        minimumVersion: versions.MINIMUM_CN_VERSION_FOR_16_SLOT_BLOCK_PROOF,
      },
      reason:
        'the block node only verifies the fixed 16-slot block root hash, which older consensus nodes do not produce',
    },
    {
      when: {component: ComponentTypes.ConsensusNode, minimumVersion: versions.MINIMUM_CN_VERSION_FOR_SHA256_HASHING},
      requires: {
        component: ComponentTypes.BlockNode,
        minimumVersion: versions.MINIMUM_BLOCK_NODE_VERSION_FOR_SHA256_HASHING,
      },
      reason: 'the consensus node hashes blocks and state with SHA-256',
    },
    {
      when: {component: ComponentTypes.ConsensusNode, minimumVersion: versions.MINIMUM_CN_VERSION_FOR_SHA256_HASHING},
      requires: {
        component: ComponentTypes.MirrorNode,
        minimumVersion: versions.MINIMUM_MIRROR_NODE_VERSION_FOR_SHA256_HASHING,
      },
      reason: 'the consensus node hashes blocks and state with SHA-256',
    },
  ];

  public static readonly TRANSITIONS: readonly ComponentVersionTransition[] = [
    {
      component: ComponentTypes.ConsensusNode,
      boundaryVersion: versions.CN_VERSION_REQUIRING_REDEPLOY,
      reason: 'the new TSS library does not convert existing keys or proofs',
    },
  ];

  /** Component types whose versions take part in compatibility rules. */
  private static readonly VERSIONED_COMPONENTS: readonly ComponentTypes[] = [
    ComponentTypes.ConsensusNode,
    ComponentTypes.BlockNode,
    ComponentTypes.MirrorNode,
    ComponentTypes.RelayNodes,
    ComponentTypes.Explorer,
  ];

  private static readonly DISPLAY_NAMES: ReadonlyMap<ComponentTypes, string> = new Map<ComponentTypes, string>([
    [ComponentTypes.ConsensusNode, 'consensus node'],
    [ComponentTypes.BlockNode, 'block node'],
    [ComponentTypes.MirrorNode, 'mirror node'],
    [ComponentTypes.RelayNodes, 'relay'],
    [ComponentTypes.Explorer, 'explorer'],
  ]);

  /**
   * Returns every constraint the tuple breaks. Constraints that involve a component absent from the tuple are
   * skipped.
   *
   * @param tuple - the component versions that will run together
   * @param involving - when set, only constraints that mention this component are evaluated, so a command reports
   *   the conflicts it would introduce rather than pre-existing ones between components it does not touch
   * @param constraints - the rules to evaluate; defaults to {@link CONSTRAINTS}
   */
  public static findViolations(
    tuple: ComponentVersionTuple,
    involving?: ComponentTypes,
    constraints: readonly ComponentVersionConstraint[] = ComponentCompatibility.CONSTRAINTS,
  ): ComponentCompatibilityViolation[] {
    const violations: ComponentCompatibilityViolation[] = [];

    for (const constraint of constraints) {
      if (involving && constraint.when.component !== involving && constraint.requires.component !== involving) {
        continue;
      }

      const whenVersion: string | undefined = tuple[constraint.when.component];
      const requiresVersion: string | undefined = tuple[constraint.requires.component];
      if (!whenVersion || !requiresVersion) {
        continue;
      }

      const applies: boolean = new SemanticVersion<string>(whenVersion).greaterThanOrEqual(
        constraint.when.minimumVersion,
      );
      if (applies && new SemanticVersion<string>(requiresVersion).lessThan(constraint.requires.minimumVersion)) {
        violations.push({constraint, whenVersion, requiresVersion});
      }
    }

    return violations;
  }

  /**
   * Returns the boundary an upgrade from `currentVersion` to `targetVersion` would cross, or `undefined` when the
   * upgrade can be performed in place.
   *
   * @param transitions - the boundaries to evaluate; defaults to {@link TRANSITIONS}
   */
  public static findCrossedTransition(
    component: ComponentTypes,
    currentVersion: string,
    targetVersion: string,
    transitions: readonly ComponentVersionTransition[] = ComponentCompatibility.TRANSITIONS,
  ): ComponentVersionTransition | undefined {
    const current: SemanticVersion<string> = new SemanticVersion<string>(currentVersion);
    const target: SemanticVersion<string> = new SemanticVersion<string>(targetVersion);

    return transitions.find(
      (transition: ComponentVersionTransition): boolean =>
        transition.component === component &&
        current.lessThan(transition.boundaryVersion) &&
        target.greaterThanOrEqual(transition.boundaryVersion),
    );
  }

  /**
   * Throws when the tuple breaks a constraint that involves `involving` (every constraint when it is `undefined`); with
   * `bypass` (--force, or a staged upgrade that leaves the nodes stopped) the violation is logged and the caller
   * proceeds.
   */
  public static assertCompatible(
    tuple: ComponentVersionTuple,
    involving: ComponentTypes | undefined,
    bypass: boolean,
    logger: SoloLogger,
  ): void {
    const violations: ComponentCompatibilityViolation[] = ComponentCompatibility.findViolations(tuple, involving);
    if (violations.length === 0) {
      return;
    }

    const conflicts: string[] = violations.map((violation: ComponentCompatibilityViolation): string =>
      ComponentCompatibility.describeConflict(violation),
    );
    if (bypass) {
      ComponentCompatibility.warnBypass(
        logger,
        `Bypassing the component version compatibility check: ${conflicts.join('; ')}`,
      );
      return;
    }

    throw new SoloErrors.validation.componentVersionIncompatible(
      conflicts,
      violations.map((violation: ComponentCompatibilityViolation): string =>
        ComponentCompatibility.describeRemedy(violation),
      ),
    );
  }

  /**
   * Throws when upgrading `component` from `currentVersion` to `targetVersion` crosses a boundary that requires a
   * redeploy; with `force` the crossing is logged and the caller proceeds. An unknown current version ('0.0.0') is
   * never rejected, since nothing is running yet.
   */
  public static assertUpgradeInPlace(
    component: ComponentTypes,
    currentVersion: string,
    targetVersion: string,
    force: boolean,
    logger: SoloLogger,
  ): void {
    if (new SemanticVersion<string>(currentVersion).equals('0.0.0')) {
      return;
    }

    const transition: ComponentVersionTransition | undefined = ComponentCompatibility.findCrossedTransition(
      component,
      currentVersion,
      targetVersion,
    );
    if (!transition) {
      return;
    }

    const componentName: string = ComponentCompatibility.displayName(component);
    if (force) {
      ComponentCompatibility.warnBypass(
        logger,
        `Force flag enabled, upgrading the ${componentName} in place from ${currentVersion} to ${targetVersion} although ${transition.reason}`,
      );
      return;
    }

    throw new SoloErrors.validation.componentUpgradeRequiresRedeploy(
      ComponentCompatibility.capitalize(componentName),
      currentVersion,
      targetVersion,
      transition.reason,
    );
  }

  /**
   * Reads the versions of the components that are present in the deployment's remote config. Remote config holds a
   * default version for every component type, so a version only counts when at least one component of that type
   * exists. A component that is registered but has not recorded its version yet (still `0.0.0`, e.g. one that one-shot
   * pre-registers before deploying it) is left out, since its version is not known.
   */
  public static deployedVersions(remoteConfig: RemoteConfigRuntimeStateApi): ComponentVersionTuple {
    const deployedComponentTypes: Set<ComponentTypes> = new Set(remoteConfig.getComponentPhasesMap().keys());
    const tuple: Partial<Record<ComponentTypes, string>> = {};

    for (const component of ComponentCompatibility.VERSIONED_COMPONENTS) {
      if (!deployedComponentTypes.has(component)) {
        continue;
      }
      const version: SemanticVersion<string> | undefined = remoteConfig.getComponentVersion(component);
      if (version && !version.equals('0.0.0')) {
        tuple[component] = version.toString();
      }
    }

    return tuple;
  }

  private static describeConflict(violation: ComponentCompatibilityViolation): string {
    const {when, requires} = violation.constraint;
    return (
      `${ComponentCompatibility.displayName(requires.component)} ${violation.requiresVersion} cannot run with ` +
      `${ComponentCompatibility.displayName(when.component)} ${violation.whenVersion}: ` +
      `${violation.constraint.reason}, which requires ${ComponentCompatibility.displayName(requires.component)} ` +
      `${ComponentCompatibility.displayVersion(requires.minimumVersion)} or newer`
    );
  }

  /** Records a bypassed rule in the log and shows it on the console, so a forced run is never silent. */
  private static warnBypass(logger: SoloLogger, message: string): void {
    logger.warn(message);
    logger.showUser(chalk.yellow(`⚠ ${message}`));
  }

  private static describeRemedy(violation: ComponentCompatibilityViolation): string {
    const {when, requires} = violation.constraint;
    return (
      `Bump the ${ComponentCompatibility.displayName(requires.component)} to ` +
      `${ComponentCompatibility.displayVersion(requires.minimumVersion)} or newer, or keep the ` +
      `${ComponentCompatibility.displayName(when.component)} below ${ComponentCompatibility.displayVersion(when.minimumVersion)}`
    );
  }

  private static displayName(component: ComponentTypes): string {
    return ComponentCompatibility.DISPLAY_NAMES.get(component) ?? component;
  }

  /** Normalizes the 'v' prefix away and drops the '-0' marker that only exists to let pre-releases satisfy a bound. */
  private static displayVersion(version: string): string {
    return new SemanticVersion<string>(version).toString().replace(/-0$/, '');
  }

  private static capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
