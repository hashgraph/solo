// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import {type ComponentName} from '../../../../../../src/core/config/remote/types.js';
import {type NodeAlias, type NodeAliases} from '../../../../../../src/types/aliases.js';
import {Templates} from '../../../../../../src/core/templates.js';
import {ComponentNameTemplates} from '../../../../../../src/core/config/remote/components/component-name-templates.js';

describe('ComponentNameTemplates', () => {
  const maxTestIndex: number = 10;
  const nodeAliases: NodeAliases = Templates.renderNodeAliasesFromCount(maxTestIndex, 0);

  it('should create a valid component name for MirrorNodeComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const componentName: ComponentName = ComponentNameTemplates.renderMirrorNodeName(index);
      expect(componentName).to.equal(`mirror-node-${index}`);
    }
  });

  it('should create a valid component name for BlockNodeComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const componentName: ComponentName = ComponentNameTemplates.renderBlockNodeName(index);
      expect(componentName).to.equal(`block-node-${index}`);
    }
  });

  it('should create a valid component name for EnvoyProxyComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const nodeAlias: NodeAlias = nodeAliases[index];

      const componentName: ComponentName = ComponentNameTemplates.renderEnvoyProxyName(index, nodeAlias);
      expect(componentName).to.equal(`envoy-proxy-${nodeAlias}-${index}`);
    }
  });

  it('should create a valid component name for HaProxyComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const nodeAlias: NodeAlias = nodeAliases[index];

      const componentName: ComponentName = ComponentNameTemplates.renderHaProxyName(index, nodeAlias);
      expect(componentName).to.equal(`haproxy-${nodeAlias}-${index}`);
    }
  });

  it('should create a valid component name for MirrorNodeExplorerComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const componentName: ComponentName = ComponentNameTemplates.renderMirrorNodeExplorerName(index);
      expect(componentName).to.equal(`mirror-node-explorer-${index}`);
    }
  });

  it('should create a valid component name for RelayComponent', () => {
    for (let index: number = 0; index < maxTestIndex; index++) {
      const componentName: ComponentName = ComponentNameTemplates.renderRelayName(index);
      expect(componentName).to.equal(`relay-${index}`);
    }
  });
});
