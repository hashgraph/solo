// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';

import * as versions from '../../../../version.js';
import {ComponentCompatibility} from '../../../../src/business/compatibility/component-compatibility.js';
import {type ComponentCompatibilityViolation} from '../../../../src/business/compatibility/component-compatibility-violation.js';
import {type ComponentVersionConstraint} from '../../../../src/business/compatibility/component-version-constraint.js';
import {type ComponentVersionTuple} from '../../../../src/business/compatibility/component-version-tuple.js';
import {type RemoteConfigRuntimeStateApi} from '../../../../src/business/runtime-state/api/remote-config-runtime-state-api.js';
import {SemanticVersion} from '../../../../src/business/utils/semantic-version.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';
import {ComponentUpgradeRequiresRedeploySoloError} from '../../../../src/core/errors/classes/validation/component-upgrade-requires-redeploy-solo-error.js';
import {ComponentVersionIncompatibleSoloError} from '../../../../src/core/errors/classes/validation/component-version-incompatible-solo-error.js';
import {DeploymentPhase} from '../../../../src/data/schema/model/remote/deployment-phase.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';

const tuple: (consensusNode?: string, blockNode?: string, mirrorNode?: string) => ComponentVersionTuple = (
  consensusNode?: string,
  blockNode?: string,
  mirrorNode?: string,
): ComponentVersionTuple => ({
  ...(consensusNode && {[ComponentTypes.ConsensusNode]: consensusNode}),
  ...(blockNode && {[ComponentTypes.BlockNode]: blockNode}),
  ...(mirrorNode && {[ComponentTypes.MirrorNode]: mirrorNode}),
});

const requiredComponents: (violations: ComponentCompatibilityViolation[]) => ComponentTypes[] = (
  violations: ComponentCompatibilityViolation[],
): ComponentTypes[] =>
  violations.map(
    (violation: ComponentCompatibilityViolation): ComponentTypes => violation.constraint.requires.component,
  );

describe('ComponentCompatibility', (): void => {
  describe('findViolations', (): void => {
    const validTuples: Array<[string, ComponentVersionTuple]> = [
      ['an all-pre-16-slot tuple', tuple('v0.75.1', '0.40.1', 'v0.160.0')],
      ['a 16-slot pair below the SHA-256 floor', tuple('v0.77.2', '0.41.0', 'v0.163.0')],
      ['the CN v0.79 matrix', tuple('v0.79.0', '0.45.0', 'v0.165.0')],
      ['newer block and mirror nodes with an older consensus node', tuple('v0.78.0', '0.45.0', 'v0.165.0')],
      ['a consensus node alone', tuple('v0.79.0')],
      ['a consensus node without a block node', tuple('v0.79.0', undefined, 'v0.165.0')],
    ];

    for (const [description, versionTuple] of validTuples) {
      it(`accepts ${description}`, (): void => {
        expect(ComponentCompatibility.findViolations(versionTuple)).to.be.empty;
      });
    }

    it('rejects a 16-slot block node with an older consensus node', (): void => {
      expect(requiredComponents(ComponentCompatibility.findViolations(tuple('v0.76.1', '0.41.0')))).to.deep.equal([
        ComponentTypes.ConsensusNode,
      ]);
    });

    it('rejects a pre-16-slot block node with a 16-slot consensus node', (): void => {
      expect(requiredComponents(ComponentCompatibility.findViolations(tuple('v0.77.2', '0.40.0')))).to.deep.equal([
        ComponentTypes.BlockNode,
      ]);
    });

    it('rejects a block node below the SHA-256 floor', (): void => {
      expect(
        requiredComponents(ComponentCompatibility.findViolations(tuple('v0.79.0', '0.44.2', 'v0.165.0'))),
      ).to.deep.equal([ComponentTypes.BlockNode]);
    });

    it('rejects a mirror node below the SHA-256 floor', (): void => {
      expect(
        requiredComponents(ComponentCompatibility.findViolations(tuple('v0.79.0', '0.45.0', 'v0.164.0'))),
      ).to.deep.equal([ComponentTypes.MirrorNode]);
    });

    it('reports every broken constraint at once', (): void => {
      expect(
        requiredComponents(ComponentCompatibility.findViolations(tuple('v0.79.0', '0.44.2', 'v0.164.0'))),
      ).to.have.members([ComponentTypes.BlockNode, ComponentTypes.MirrorNode]);
    });

    it('only evaluates constraints that involve the given component', (): void => {
      const versionTuple: ComponentVersionTuple = tuple('v0.79.0', '0.45.0', 'v0.164.0');

      expect(ComponentCompatibility.findViolations(versionTuple, ComponentTypes.BlockNode)).to.be.empty;
      expect(
        requiredComponents(ComponentCompatibility.findViolations(versionTuple, ComponentTypes.MirrorNode)),
      ).to.deep.equal([ComponentTypes.MirrorNode]);
    });

    describe('pre-release boundaries', (): void => {
      it('applies the SHA-256 floor to consensus node pre-releases', (): void => {
        expect(ComponentCompatibility.findViolations(tuple('v0.79.0-alpha.1', '0.44.2'))).to.have.lengthOf(1);
        expect(ComponentCompatibility.findViolations(tuple('v0.79.0-rc.1', '0.44.2'))).to.have.lengthOf(1);
      });

      it('lets pre-releases of the minimum version satisfy the floor', (): void => {
        expect(ComponentCompatibility.findViolations(tuple('v0.79.0', '0.45.0-rc1', 'v0.165.0-alpha1'))).to.be.empty;
      });

      it('does not apply the floor to the last release below it', (): void => {
        expect(ComponentCompatibility.findViolations(tuple('v0.78.9', '0.44.2', 'v0.164.0'))).to.be.empty;
      });
    });

    it('evaluates a declared constraint without new logic', (): void => {
      const relayFloor: ComponentVersionConstraint = {
        when: {component: ComponentTypes.ConsensusNode, minimumVersion: 'v0.79.0-0'},
        requires: {component: ComponentTypes.RelayNodes, minimumVersion: 'v0.80.0-0'},
        reason: 'test relay floor',
      };
      const versionTuple: ComponentVersionTuple = {
        [ComponentTypes.ConsensusNode]: 'v0.79.0',
        [ComponentTypes.RelayNodes]: '0.79.0',
      };

      expect(
        requiredComponents(ComponentCompatibility.findViolations(versionTuple, undefined, [relayFloor])),
      ).to.deep.equal([ComponentTypes.RelayNodes]);
    });
  });

  describe('assertCompatible', (): void => {
    let logger: SoloLogger;
    let warn: SinonStub;
    let showUser: SinonStub;

    beforeEach((): void => {
      warn = sinon.stub();
      showUser = sinon.stub();
      logger = {warn, showUser} as unknown as SoloLogger;
    });

    it('throws an error that names the component to bump', (): void => {
      expect((): void =>
        ComponentCompatibility.assertCompatible(tuple('v0.79.0', '0.44.2'), ComponentTypes.BlockNode, false, logger),
      )
        .to.throw(ComponentVersionIncompatibleSoloError)
        .with.property('message')
        .that.matches(/block node 0\.44\.2 cannot run with consensus node v0\.79\.0/)
        .and.matches(/block node 0\.45\.0 or newer/);
    });

    it('logs instead of throwing when force is set', (): void => {
      expect((): void =>
        ComponentCompatibility.assertCompatible(tuple('v0.79.0', '0.44.2'), ComponentTypes.BlockNode, true, logger),
      ).to.not.throw();
      expect(warn.calledOnce).to.be.true;
      expect(showUser.calledOnce).to.be.true;
    });

    it('checks every constraint when no component is given', (): void => {
      expect((): void =>
        ComponentCompatibility.assertCompatible(
          {
            [ComponentTypes.ConsensusNode]: 'v0.79.0',
            [ComponentTypes.BlockNode]: '0.45.0',
            [ComponentTypes.MirrorNode]: '0.164.0',
          },
          undefined,
          false,
          logger,
        ),
      )
        .to.throw(ComponentVersionIncompatibleSoloError)
        .with.property('message')
        .that.matches(/mirror node 0\.164\.0 cannot run with consensus node v0\.79\.0/);
    });

    it('stays silent for a compatible tuple', (): void => {
      ComponentCompatibility.assertCompatible(tuple('v0.79.0', '0.45.0'), ComponentTypes.BlockNode, false, logger);
      expect(warn.called).to.be.false;
      expect(showUser.called).to.be.false;
    });
  });

  describe('upgrade transitions', (): void => {
    let logger: SoloLogger;
    let warn: SinonStub;
    let showUser: SinonStub;

    beforeEach((): void => {
      warn = sinon.stub();
      showUser = sinon.stub();
      logger = {warn, showUser} as unknown as SoloLogger;
    });

    it('rejects upgrading a consensus node across the redeploy boundary', (): void => {
      expect((): void =>
        ComponentCompatibility.assertUpgradeInPlace(ComponentTypes.ConsensusNode, '0.78.2', 'v0.79.0', false, logger),
      )
        .to.throw(ComponentUpgradeRequiresRedeploySoloError)
        .with.property('message')
        .that.matches(/Consensus node cannot be upgraded in place from 0\.78\.2 to v0\.79\.0/);
    });

    it('treats a pre-release of the boundary version as crossing it', (): void => {
      expect(ComponentCompatibility.findCrossedTransition(ComponentTypes.ConsensusNode, 'v0.78.2', 'v0.79.0-alpha.1'))
        .to.not.be.undefined;
    });

    it('allows upgrades on either side of the boundary', (): void => {
      expect(ComponentCompatibility.findCrossedTransition(ComponentTypes.ConsensusNode, 'v0.77.2', 'v0.78.2')).to.be
        .undefined;
      expect(ComponentCompatibility.findCrossedTransition(ComponentTypes.ConsensusNode, 'v0.79.0-alpha.1', 'v0.79.1'))
        .to.be.undefined;
    });

    it('only applies a boundary to its own component', (): void => {
      expect(ComponentCompatibility.findCrossedTransition(ComponentTypes.MirrorNode, 'v0.78.0', 'v0.79.0')).to.be
        .undefined;
    });

    it('does not reject when the current version is unknown', (): void => {
      expect((): void =>
        ComponentCompatibility.assertUpgradeInPlace(ComponentTypes.ConsensusNode, '0.0.0', 'v0.79.0', false, logger),
      ).to.not.throw();
    });

    it('logs instead of throwing when force is set', (): void => {
      expect((): void =>
        ComponentCompatibility.assertUpgradeInPlace(ComponentTypes.ConsensusNode, 'v0.78.2', 'v0.79.0', true, logger),
      ).to.not.throw();
      expect(warn.calledOnce).to.be.true;
      expect(showUser.calledOnce).to.be.true;
    });
  });

  describe('deployedVersions', (): void => {
    it('only reports versions of component types that have deployed components', (): void => {
      const remoteConfig: RemoteConfigRuntimeStateApi = {
        getComponentPhasesMap: (): Map<ComponentTypes, DeploymentPhase> =>
          new Map([
            [ComponentTypes.ConsensusNode, DeploymentPhase.STARTED],
            [ComponentTypes.MirrorNode, DeploymentPhase.DEPLOYED],
          ]),
        getComponentVersion: (type: ComponentTypes): SemanticVersion<string> =>
          new SemanticVersion<string>(type === ComponentTypes.MirrorNode ? '0.165.0' : '0.79.0'),
      } as unknown as RemoteConfigRuntimeStateApi;

      expect(ComponentCompatibility.deployedVersions(remoteConfig)).to.deep.equal({
        [ComponentTypes.ConsensusNode]: '0.79.0',
        [ComponentTypes.MirrorNode]: '0.165.0',
      });
    });

    // one-shot registers the mirror node before deploying it; until then its version is the 0.0.0 placeholder
    it('leaves out a registered component that has not recorded its version yet', (): void => {
      const remoteConfig: RemoteConfigRuntimeStateApi = {
        getComponentPhasesMap: (): Map<ComponentTypes, DeploymentPhase> =>
          new Map([
            [ComponentTypes.ConsensusNode, DeploymentPhase.DEPLOYED],
            [ComponentTypes.MirrorNode, DeploymentPhase.REQUESTED],
          ]),
        getComponentVersion: (type: ComponentTypes): SemanticVersion<string> =>
          new SemanticVersion<string>(type === ComponentTypes.MirrorNode ? '0.0.0' : '0.79.0'),
      } as unknown as RemoteConfigRuntimeStateApi;

      expect(ComponentCompatibility.deployedVersions(remoteConfig)).to.deep.equal({
        [ComponentTypes.ConsensusNode]: '0.79.0',
      });
    });
  });

  // Solo must never ship defaults that its own gate would reject.
  describe('shipped defaults', (): void => {
    it('the default component versions satisfy every constraint', (): void => {
      expect(
        ComponentCompatibility.findViolations({
          [ComponentTypes.ConsensusNode]: versions.HEDERA_PLATFORM_VERSION,
          [ComponentTypes.BlockNode]: versions.BLOCK_NODE_VERSION,
          [ComponentTypes.MirrorNode]: versions.MIRROR_NODE_VERSION,
          [ComponentTypes.RelayNodes]: versions.HEDERA_JSON_RPC_RELAY_VERSION,
          [ComponentTypes.Explorer]: versions.EXPLORER_VERSION,
        }),
      ).to.be.empty;
    });

    it('the edge component versions satisfy every constraint', (): void => {
      expect(
        ComponentCompatibility.findViolations({
          [ComponentTypes.ConsensusNode]: versions.HEDERA_PLATFORM_EDGE_VERSION,
          [ComponentTypes.BlockNode]: versions.BLOCK_NODE_EDGE_VERSION,
          [ComponentTypes.MirrorNode]: versions.MIRROR_NODE_EDGE_VERSION,
          [ComponentTypes.RelayNodes]: versions.HEDERA_JSON_RPC_RELAY_EDGE_VERSION,
          [ComponentTypes.Explorer]: versions.EXPLORER_EDGE_VERSION,
        }),
      ).to.be.empty;
    });
  });
});
