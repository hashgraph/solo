// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {MirrorNodeComponent} from '../../../../../../src/core/config/remote/components/mirror-node-component.js';
import {type ComponentName} from '../../../../../../src/core/config/remote/types.js';
import {BlockNodeComponent} from '../../../../../../src/core/config/remote/components/block-node-component.js';
import {EnvoyProxyComponent} from '../../../../../../src/core/config/remote/components/envoy-proxy-component.js';
import {HaProxyComponent} from '../../../../../../src/core/config/remote/components/ha-proxy-component.js';
import {MirrorNodeExplorerComponent} from '../../../../../../src/core/config/remote/components/mirror-node-explorer-component.js';
import {RelayComponent} from '../../../../../../src/core/config/remote/components/relay-component.js';
import {type NodeAlias, type NodeAliases} from '../../../../../../src/types/aliases.js';
import {Templates} from '../../../../../../src/core/templates.js';

describe('', () => {
  const maxTestIndex: number = 10;
  const nodeAliases: NodeAliases = Templates.renderNodeAliasesFromCount(maxTestIndex, 0);

  it('should create a valid component name for MirrorNodeComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      // @ts-expect-error - to access private method
      const componentName: ComponentName = MirrorNodeComponent.renderMirrorNodeName(index);
      expect(componentName).to.equal(`mirror-node-${index}`);
    }
  });

  it('should create a valid component name for BlockNodeComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      // @ts-expect-error - to access private method
      const componentName: ComponentName = BlockNodeComponent.renderBlockNodeName(index);
      expect(componentName).to.equal(`block-node-${index}`);
    }
  });

  it('should create a valid component name for EnvoyProxyComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const nodeAlias: NodeAlias = nodeAliases[index];

      // @ts-expect-error - to access private method
      const componentName: ComponentName = EnvoyProxyComponent.renderEnvoyProxyName(index, nodeAlias);
      expect(componentName).to.equal(`envoy-proxy-${nodeAlias}-${index}`);
    }
  });

  it('should create a valid component name for HaProxyComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const nodeAlias: NodeAlias = nodeAliases[index];

      // @ts-expect-error - to access private method
      const componentName: ComponentName = HaProxyComponent.renderHaProxyName(index, nodeAlias);
      expect(componentName).to.equal(`haproxy-${nodeAlias}-${index}`);
    }
  });

  it('should create a valid component name for MirrorNodeExplorerComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      // @ts-expect-error - to access private method
      const componentName: ComponentName = MirrorNodeExplorerComponent.renderMirrorNodeExplorerName(index);
      expect(componentName).to.equal(`mirror-node-explorer-${index}`);
    }
  });

  it('should create a valid component name for RelayComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      // @ts-expect-error - to access private method
      const componentName: ComponentName = RelayComponent.renderRelayName(index);
      expect(componentName).to.equal(`relay-${index}`);
    }
  });
});
