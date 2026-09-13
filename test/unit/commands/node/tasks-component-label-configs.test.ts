// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {NodeCommandTasks} from '../../../../src/commands/node/tasks.js';
import {ComponentTypes} from '../../../../src/core/config/remote/enumerations/component-types.js';

/**
 * Guards the diagnostics collector's component list against drift.
 *
 * `NodeCommandTasks.COMPONENT_LABEL_CONFIGS` is maintained by hand and had fallen behind the
 * components Solo deploys: HAProxy and Envoy were absent, so a crash-looping proxy produced no
 * pod log and no `*.describe.txt`, leaving `DiagnosticsAnalyzer` blind to it. The failure then
 * surfaced only as a downstream client error attributed to the consensus node behind the proxy.
 */
describe('NodeCommandTasks component label configs', (): void => {
  const configs: ReadonlyArray<{name: string; labels: string[]}> = NodeCommandTasks.componentLabelConfigs;

  const selectorFor: (name: string) => string[] | undefined = (name: string): string[] | undefined =>
    configs.find((config: {name: string; labels: string[]}): boolean => config.name === name)?.labels;

  it('collects HAProxy pods, which front every consensus node', (): void => {
    expect(selectorFor('haproxy')).to.deep.equal(['solo.hedera.com/type=haproxy']);
  });

  it('collects Envoy proxy pods, which front every consensus node', (): void => {
    expect(selectorFor('envoy proxy')).to.deep.equal(['solo.hedera.com/type=envoy-proxy']);
  });

  it('does not confuse the per-node HAProxy with the mirror ingress controller', (): void => {
    // Both are "haproxy" by name but are different components with different selectors; collapsing
    // them would silently drop the per-node proxies again.
    expect(selectorFor('haproxy')).to.not.deep.equal(selectorFor('ingress controller'));
  });

  // Explicit rather than derived from the enum value by string munging: the collector's entry names
  // ("consensus node", "mirror importer") do not follow from the enum names, and a heuristic that
  // guesses at them can pass while matching the wrong entry — which is how this drift went unnoticed.
  // `undefined` means the component does not run as a pod and has no logs to collect.
  const expectedCollectorEntry: Record<ComponentTypes, string | undefined> = {
    [ComponentTypes.ConsensusNode]: 'consensus node',
    [ComponentTypes.HaProxy]: 'haproxy',
    [ComponentTypes.EnvoyProxy]: 'envoy proxy',
    [ComponentTypes.BlockNode]: 'block node',
    [ComponentTypes.MirrorNode]: 'mirror importer',
    [ComponentTypes.Explorer]: 'explorer',
    [ComponentTypes.RelayNodes]: 'relay node',
    [ComponentTypes.Postgres]: 'mirror postgres',
    [ComponentTypes.Redis]: 'mirror redis',
    [ComponentTypes.Cli]: undefined,
    [ComponentTypes.Chart]: undefined,
  };

  it('covers every component type that runs as a pod', (): void => {
    const missing: string[] = [];
    for (const [componentType, entryName] of Object.entries(expectedCollectorEntry)) {
      if (entryName === undefined) {
        continue;
      }
      if (selectorFor(entryName) === undefined) {
        missing.push(`${componentType} (expected entry "${entryName}")`);
      }
    }

    expect(missing, `component types with no log collector entry: ${missing.join(', ')}`).to.be.empty;
  });

  it('maps every known component type, so a new one cannot be added silently', (): void => {
    // Adding a member to ComponentTypes fails here until it is classified above as either a pod
    // (with a collector entry) or explicitly not a pod.
    const unmapped: ComponentTypes[] = Object.values(ComponentTypes).filter(
      (componentType: ComponentTypes): boolean => !(componentType in expectedCollectorEntry),
    );

    expect(unmapped, `component types absent from this test's mapping: ${unmapped.join(', ')}`).to.be.empty;
  });

  it('declares a non-empty label selector for every entry', (): void => {
    for (const config of configs) {
      expect(config.labels, `selector missing for ${config.name}`).to.not.be.empty;
    }
  });
});
