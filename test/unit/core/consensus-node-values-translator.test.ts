// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {ConsensusNodeValuesTranslator} from '../../../src/core/consensus-node-values-translator.js';
import {type AnyObject} from '../../../src/types/aliases.js';

/**
 * The translator is what lets one umbrella-shaped values set drive a shared release plus one release
 * per consensus node. Its two invariants are that network-scoped material never leaks into a per-node
 * release, and that a node's own identity ends up at the top level where a single-node chart reads it.
 */
describe('ConsensusNodeValuesTranslator', (): void => {
  function umbrellaValues(): AnyObject {
    return {
      global: {namespaceOverride: ''},
      terminationGracePeriodSeconds: 10,
      cloud: {minio: {enabled: true}, buckets: {streamBucket: 'solo-streams'}},
      cheetah: {maxProcessors: 10},
      deployment: {podAnnotations: {}, init: {enableDnsValidation: true}},
      haproxyDeployment: {podLabels: {}},
      envoyDeployment: {podLabels: {}},
      crs: {podLog: {enabled: true}},
      'minio-server': {tenant: {name: 'minio', buckets: [{name: 'solo-streams'}]}},
      tenant: {tenant: {name: 'minio'}},
      defaults: {
        volumeClaims: {enabled: true, storageClassName: 'standard'},
        root: {image: {tag: '0.46.1'}, extraEnv: []},
        consensus: {service: {type: 'NodePort'}},
        haproxy: {enabled: true, maxconn: 32},
        envoyProxy: {enabled: true},
        sidecars: {recordStreamUploader: {enabled: true}},
      },
      hedera: {
        initContainers: [{name: 'seed'}],
        configMaps: {
          applicationEnv: 'FOO=bar',
          settingsTxt: 'stuff',
          genesisNetworkJson: '{}',
        },
        nodes: [
          {name: 'node1', nodeId: 0, accountId: '0.0.3', haproxyStaticIP: '10.0.0.1'},
          {name: 'node2', nodeId: 1, accountId: '0.0.4', labels: {tier: 'b'}},
        ],
      },
    };
  }

  describe('toSharedValues', (): void => {
    it('empties the node list while preserving network-scoped material', (): void => {
      const shared: AnyObject = ConsensusNodeValuesTranslator.toSharedValues(umbrellaValues());

      expect((shared.hedera as AnyObject).nodes).to.deep.equal([]);
      expect((shared.hedera as AnyObject).configMaps).to.have.property('genesisNetworkJson');
      expect(shared['minio-server']).to.have.nested.property('tenant.name', 'minio');
      expect(shared.crs).to.have.nested.property('podLog.enabled', true);
    });

    it('preserves the roster so the dns validation script still probes every node', (): void => {
      const shared: AnyObject = ConsensusNodeValuesTranslator.toSharedValues(umbrellaValues());
      const roster: AnyObject[] = (shared.hedera as AnyObject).rosterNodes as AnyObject[];

      expect(roster.map((node: AnyObject): unknown => node.name)).to.deep.equal(['node1', 'node2']);
    });

    it('keeps the full node objects in the roster so a half-finished conversion can resume', (): void => {
      // `convertToSplit` empties `hedera.nodes` on the shared release before installing the per-node
      // releases. If it fails in between, the only remaining description of the nodes is
      // `rosterNodes` — reducing it to a list of names would strand the deployment with no way to
      // rebuild the per-node values.
      const shared: AnyObject = ConsensusNodeValuesTranslator.toSharedValues(umbrellaValues());
      const roster: AnyObject[] = (shared.hedera as AnyObject).rosterNodes as AnyObject[];

      expect(roster[0]).to.include({name: 'node1', nodeId: 0, accountId: '0.0.3'});
      expect(ConsensusNodeValuesTranslator.toNodeValues({hedera: {nodes: roster}}, 'node2')).to.include({
        name: 'node2',
        nodeId: 1,
      });
    });

    it('does not mutate the input', (): void => {
      const input: AnyObject = umbrellaValues();
      ConsensusNodeValuesTranslator.toSharedValues(input);

      expect(((input.hedera as AnyObject).nodes as unknown[]).length).to.equal(2);
    });
  });

  describe('toNodeValues', (): void => {
    it('lifts the named node to the top level', (): void => {
      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrellaValues(), 'node2');

      expect(flat.name).to.equal('node2');
      expect(flat.nodeId).to.equal(1);
      expect(flat.accountId).to.equal('0.0.4');
      expect(flat.labels).to.deep.equal({tier: 'b'});
      expect(flat.haproxyStaticIP).to.be.undefined;
    });

    it('lifts defaults to the top level so templates read .Values.x directly', (): void => {
      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrellaValues(), 'node1');

      expect(flat.root).to.have.nested.property('image.tag', '0.46.1');
      expect(flat.haproxy).to.have.property('maxconn', 32);
      expect(flat.volumeClaims).to.have.property('storageClassName', 'standard');
      expect(flat.sidecars).to.have.nested.property('recordStreamUploader.enabled', true);
      expect(flat.defaults).to.be.undefined;
    });

    it('keeps network-scoped material out of a per-node release', (): void => {
      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrellaValues(), 'node1');

      expect(flat['minio-server']).to.be.undefined;
      expect(flat.tenant).to.be.undefined;
      expect(flat.crs).to.be.undefined;
      expect(flat.hedera).to.be.undefined;
      // only applicationEnv is read by the node's own templates
      expect(flat.configMaps).to.deep.equal({applicationEnv: 'FOO=bar'});
    });

    it('carries the MinIO tenant hostname across as a plain value', (): void => {
      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrellaValues(), 'node1');

      expect(flat.cloud).to.have.nested.property('minio.tenantName', 'minio');
      // the passthrough cloud config survives the tenantName injection
      expect(flat.cloud).to.have.nested.property('buckets.streamBucket', 'solo-streams');
      expect(flat.cloud).to.have.nested.property('minio.enabled', true);
    });

    it('carries the whole volumeClaims subtree, including keys the umbrella gains later', (): void => {
      // The lift is by subtree rather than by key, which is what lets a chart feature gated on a new
      // `defaults.volumeClaims.*` value (`appJarsInImage`, `capacityCheck`) reach the single-node
      // chart without a translator change. Pinning that here keeps the two charts from drifting.
      const umbrella: AnyObject = umbrellaValues();
      const volumeClaims: AnyObject = {
        ...((umbrella.defaults as AnyObject).volumeClaims as AnyObject),
        appJarsInImage: true,
        capacityCheck: {enabled: true, tolerancePercent: 90},
      };
      (umbrella.defaults as AnyObject).volumeClaims = volumeClaims;

      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrella, 'node1');

      expect(flat.volumeClaims).to.deep.equal(volumeClaims);
    });

    it('passes the shared init containers through', (): void => {
      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrellaValues(), 'node1');

      expect(flat.initContainers).to.deep.equal([{name: 'seed'}]);
    });

    it('omits rather than empties the keys a partial delta does not mention', (): void => {
      // The node-lifecycle builders pass only the keys they are changing and rely on `--reuse-values`
      // for the rest. Emitting an empty `cloud` or `root` here would overwrite the live release's
      // values with nothing and re-render the node from chart defaults.
      const delta: AnyObject = {hedera: {nodes: [{name: 'node1', accountId: '0.0.9'}]}};

      const flat: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(delta, 'node1');

      expect(flat).to.deep.equal({name: 'node1', accountId: '0.0.9'});
      expect(flat).to.not.have.property('cloud');
      expect(flat).to.not.have.property('root');
      expect(flat).to.not.have.property('configMaps');
    });

    it('throws a registered SoloError naming the node when it is absent', (): void => {
      expect((): AnyObject => ConsensusNodeValuesTranslator.toNodeValues(umbrellaValues(), 'node9')).to.throw(/node9/);
    });
  });

  describe('mergeValuesFiles', (): void => {
    it('skips paths that do not exist rather than throwing', (): void => {
      expect(ConsensusNodeValuesTranslator.mergeValuesFiles(['/nonexistent/a.yaml'])).to.deep.equal({});
    });
  });

  /**
   * Solo computes a large part of a deployment as `--set` overrides rather than values-file entries —
   * the storage backend, the `crds.*` toggles, static IPs, and the node names themselves. A split
   * install that reads only the values files silently drops all of it, which is not visible to
   * `helm template` because those overrides never reach a rendered file.
   */
  describe('fromHelmArguments', (): void => {
    it('folds --set overrides on top of the values files', (): void => {
      const values: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments([
        '--set',
        'crds.serviceMonitor.enabled=true',
        '--set',
        'cloud.minio.enabled=false',
      ]);

      expect(values).to.have.nested.property('crds.serviceMonitor.enabled', true);
      expect(values).to.have.nested.property('cloud.minio.enabled', false);
    });

    it('creates array elements for indexed node paths', (): void => {
      const values: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments([
        '--set',
        'hedera.nodes[0].name=node1',
        '--set',
        'hedera.nodes[1].name=node2',
        '--set',
        'hedera.nodes[1].haproxyStaticIP=10.0.0.9',
      ]);

      expect((values.hedera as AnyObject).nodes).to.deep.equal([
        {name: 'node1'},
        {name: 'node2', haproxyStaticIP: '10.0.0.9'},
      ]);
    });

    it('coerces scalars for --set but keeps --set-literal verbatim', (): void => {
      const values: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments([
        '--set',
        'a.number=42',
        '--set',
        'a.boolean=false',
        '--set',
        'a.nothing=null',
        '--set-literal',
        'a.literal=42',
        '--set-string',
        'a.string=true',
      ]);

      const a: AnyObject = values.a as AnyObject;
      expect(a.number).to.equal(42);
      expect(a.boolean).to.equal(false);
      expect(a.nothing).to.equal(null);
      expect(a.literal).to.equal('42');
      expect(a.string).to.equal('true');
    });

    it('refuses a values path that would reach the prototype chain', (): void => {
      // Solo only ever emits its own paths, but this helper walks an arbitrary dotted chain, so a
      // `__proto__` segment would otherwise corrupt every object in the process.
      for (const unsafe of ['__proto__.polluted', 'a.constructor.prototype.polluted', 'prototype.x']) {
        expect((): AnyObject => ConsensusNodeValuesTranslator.fromHelmArguments(['--set', `${unsafe}=1`])).to.throw(
          /unsafe values path/,
        );
      }

      expect(({} as AnyObject).polluted).to.be.undefined;
    });

    it('ignores --values entries that do not exist and unknown flags', (): void => {
      const values: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments([
        '--values',
        '/nonexistent/base.yaml',
        '--wait',
        '--set',
        'kept=yes',
      ]);

      expect(values).to.deep.equal({kept: 'yes'});
    });

    it('carries node-scoped --set overrides through to the flat per-node values', (): void => {
      // the end-to-end guarantee: an override Solo only ever expressed as `--set` still reaches the
      // per-node release, and a network-scoped one still reaches the shared release
      const umbrella: AnyObject = ConsensusNodeValuesTranslator.fromHelmArguments([
        '--set',
        'hedera.nodes[0].name=node1',
        '--set',
        'hedera.nodes[0].nodeId=0',
        '--set',
        'hedera.nodes[0].accountId=0.0.3',
        '--set',
        'hedera.nodes[0].haproxyStaticIP=10.0.0.9',
        '--set',
        'crds.serviceMonitor.enabled=true',
      ]);

      const node: AnyObject = ConsensusNodeValuesTranslator.toNodeValues(umbrella, 'node1');
      expect(node.haproxyStaticIP).to.equal('10.0.0.9');
      expect(node.nodeId).to.equal(0);
      expect(node.crds).to.be.undefined;

      const shared: AnyObject = ConsensusNodeValuesTranslator.toSharedValues(umbrella);
      expect(shared).to.have.nested.property('crds.serviceMonitor.enabled', true);
      expect((shared.hedera as AnyObject).nodes).to.deep.equal([]);
    });
  });
});
