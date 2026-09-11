// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {before, describe, it} from 'mocha';
import path from 'node:path';
import fs from 'node:fs';
import * as yaml from 'yaml';
import {ClusterTaskManager} from '../../../src/core/cluster-task-manager.js';
import * as constants from '../../../src/core/constants.js';
import {resetForTest} from '../../test-container.js';
import {type OsPackageManager} from '../../../src/core/package-managers/os-package-manager.js';
import {type DefaultKindClientBuilder} from '../../../src/integration/kind/impl/default-kind-client-builder.js';
import {type DependencyManager} from '../../../src/core/dependency-managers/dependency-manager.js';
import {type KindDependencyManager} from '../../../src/core/dependency-managers/kind-dependency-manager.js';
import {type PodmanDependencyManager} from '../../../src/core/dependency-managers/podman-dependency-manager.js';
import {type K8Factory} from '../../../src/integration/kube/k8-factory.js';
import {type GitClient} from '../../../src/integration/git/git-client.js';

function getConfigFilePath(manager: ClusterTaskManager, useSmallMemoryCluster: boolean): string {
  return (
    manager as unknown as {
      getConfigFilePath: (useSmallMemoryCluster: boolean) => string;
    }
  ).getConfigFilePath(useSmallMemoryCluster);
}

function createClusterTaskManager(): ClusterTaskManager {
  return new ClusterTaskManager(
    {} as unknown as OsPackageManager,
    {} as unknown as DefaultKindClientBuilder,
    {} as unknown as PodmanDependencyManager,
    {} as unknown as KindDependencyManager,
    '/tmp/podman',
    {} as unknown as K8Factory,
    {} as unknown as DependencyManager,
    '/tmp/kind',
    {} as unknown as GitClient,
  );
}

describe('ClusterTaskManager', (): void => {
  before((): void => {
    resetForTest();
  });

  it('should return configured kind config for default cluster setup', (): void => {
    const manager: ClusterTaskManager = createClusterTaskManager();

    expect(getConfigFilePath(manager, false)).to.equal(constants.KIND_CLUSTER_CONFIG_FILE);
  });

  it('should stage small-memory kind config under the shared cache directory with an absolute patches hostPath', (): void => {
    const manager: ClusterTaskManager = createClusterTaskManager();
    const configPath: string = getConfigFilePath(manager, true);

    // The rendered config must live under SOLO_CACHE_DIR (~/.solo/cache), a path Docker Desktop
    // shares by default, rather than the install directory (e.g. /opt/homebrew/Cellar).
    const expectedStagedDirectory: string = path.join(constants.SOLO_CACHE_DIR, 'templates', 'small-memory');
    expect(path.isAbsolute(configPath)).to.equal(true);
    expect(configPath).to.equal(path.join(expectedStagedDirectory, 'kind-config.yaml'));
    expect(fs.existsSync(configPath)).to.equal(true);

    // The patches directory must be staged alongside the rendered config.
    const expectedPatchesDirectory: string = path.join(expectedStagedDirectory, 'patches');
    expect(fs.existsSync(expectedPatchesDirectory)).to.equal(true);

    // The patches mount must be rewritten to the absolute staged path (not the bundled relative one).
    const renderedConfig: {nodes?: {extraMounts?: {hostPath?: string; containerPath?: string}[]}[]} = yaml.parse(
      fs.readFileSync(configPath, 'utf8'),
    );
    const patchesMount: {hostPath?: string; containerPath?: string} | undefined = renderedConfig.nodes
      ?.flatMap((node): {hostPath?: string; containerPath?: string}[] => node.extraMounts ?? [])
      .find((mount): boolean => mount.containerPath === '/patches');
    expect(patchesMount, 'patches mount should be present').to.not.equal(undefined);
    expect(patchesMount?.hostPath).to.equal(expectedPatchesDirectory);
    expect(path.isAbsolute(patchesMount?.hostPath ?? '')).to.equal(true);
  });

  it('should expose the one-shot NodePorts via Kind extraPortMappings', (): void => {
    const manager: ClusterTaskManager = createClusterTaskManager();
    const configPath: string = getConfigFilePath(manager, true);

    const renderedConfig: {
      nodes?: {
        extraPortMappings?: {containerPort?: number; hostPort?: number; listenAddress?: string; protocol?: string}[];
      }[];
    } = yaml.parse(fs.readFileSync(configPath, 'utf8'));

    const portMappings: {containerPort?: number; hostPort?: number; listenAddress?: string; protocol?: string}[] =
      renderedConfig.nodes
        ? renderedConfig.nodes.flatMap(
            (node): {containerPort?: number; hostPort?: number; listenAddress?: string; protocol?: string}[] =>
              node.extraPortMappings ?? [],
          )
        : [];

    // containerPort values are NodePorts (range 30000-32767): 30003/30004 must match
    // resources/one-shot/mirror-ingress-controller-nodeport-values.yaml, the rest the
    // ONE_SHOT_*_NODE_PORT constants. Each hostPort is the legacy port-forward port so existing
    // localhost URLs keep working without a flaky kubectl port-forward tunnel.
    const expectedMappings: {containerPort: number; hostPort: number}[] = [
      {containerPort: 30_003, hostPort: constants.ONE_SHOT_MIRROR_REST_HOST_PORT},
      {containerPort: 30_004, hostPort: 30_004},
      {containerPort: constants.ONE_SHOT_EXPLORER_NODE_PORT, hostPort: constants.ONE_SHOT_EXPLORER_HOST_PORT},
      {containerPort: constants.ONE_SHOT_RELAY_NODE_PORT, hostPort: constants.ONE_SHOT_RELAY_HOST_PORT},
      {
        containerPort: constants.ONE_SHOT_CONSENSUS_GRPC_NODE_PORT,
        hostPort: constants.ONE_SHOT_CONSENSUS_GRPC_HOST_PORT,
      },
    ];
    for (const expected of expectedMappings) {
      const mapping:
        {containerPort?: number; hostPort?: number; listenAddress?: string; protocol?: string} | undefined =
        portMappings.find((entry): boolean => entry.containerPort === expected.containerPort);
      expect(mapping, `extraPortMapping for ${expected.containerPort} should be present`).to.not.equal(undefined);
      expect(mapping?.hostPort).to.equal(expected.hostPort);
      expect(expected.containerPort).to.be.greaterThanOrEqual(30_000).and.lessThanOrEqual(32_767);
      // Must stay pinned to loopback: Kind defaults to 0.0.0.0, and a wildcard bind on a host port
      // inside the Linux ephemeral range (32768-60999) collides with any outbound connection holding
      // that port, failing the whole cluster creation with "bind: address already in use".
      expect(mapping?.listenAddress, `extraPortMapping for ${expected.containerPort} must bind loopback only`).to.equal(
        constants.LOCAL_HOST,
      );
    }
  });
});
