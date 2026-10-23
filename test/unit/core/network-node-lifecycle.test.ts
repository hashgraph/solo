// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {NetworkNodeLifecycle} from '../../../src/core/network-node-lifecycle.js';

describe('NetworkNodeLifecycle', (): void => {
  const soloContainer: string = NetworkNodeLifecycle.SOLO_CONTAINER_MODE;
  const consensusNodeImage: string = NetworkNodeLifecycle.CONSENSUS_NODE_IMAGE_MODE;

  it('should only select the consensus node image mode for its exact value', (): void => {
    expect(NetworkNodeLifecycle.isConsensusNodeImage(consensusNodeImage)).to.equal(true);
    expect(NetworkNodeLifecycle.isConsensusNodeImage(soloContainer)).to.equal(false);
  });

  it('should reject an unknown lifecycle mode instead of silently using the default', (): void => {
    expect((): boolean => NetworkNodeLifecycle.isConsensusNodeImage('consensus-node-images')).to.throw(
      "Invalid NETWORK_NODE_LIFECYCLE_MODE 'consensus-node-images'",
    );
    expect((): string => NetworkNodeLifecycle.buildStopCommand('')).to.throw('Invalid NETWORK_NODE_LIFECYCLE_MODE');
  });

  it('should use the solo-container helper in the default mode', (): void => {
    const start: string = NetworkNodeLifecycle.buildStartCommand(soloContainer);
    expect(start).to.contain('/command/network-node-lifecycle" start-and-enable-autostart');
    expect(start).to.contain('enable-autostart; exit 0');
    expect(start).to.not.contain('s6-svc');
    expect(NetworkNodeLifecycle.buildStopCommand(soloContainer)).to.contain('stop-and-disable-autostart');
    expect(NetworkNodeLifecycle.buildDisableAutostartCommand(soloContainer)).to.contain('disable-autostart');
  });

  it('should drive the s6 consensus service in the consensus node image mode', (): void => {
    const start: string = NetworkNodeLifecycle.buildStartCommand(consensusNodeImage);
    expect(start).to.contain('/command/s6-svc" -wD -T 60000 -d "/run/service/consensus"');
    expect(start).to.contain('/command/s6-svc" -o "/run/service/consensus"');
    expect(start).to.not.contain('network-node-lifecycle');

    const stop: string = NetworkNodeLifecycle.buildStopCommand(consensusNodeImage);
    expect(stop).to.contain('/command/s6-svc" -wD -T 60000 -d "/run/service/consensus"');
    expect(stop).to.not.contain('network-node-lifecycle');

    expect(NetworkNodeLifecycle.buildDisableAutostartCommand(consensusNodeImage)).to.equal('true');
  });

  it('should point the root image at the released consensus node image without the v prefix', (): void => {
    expect(NetworkNodeLifecycle.buildDefaultsValues('v0.77.2', consensusNodeImage)).to.deep.equal({
      root: {
        image: {
          registry: 'gcr.io',
          repository: 'hedera-registry/consensus-node',
          tag: '0.77.2',
          pullPolicy: 'IfNotPresent',
        },
      },
      volumeClaims: {appJarsInImage: true},
    });
    expect(NetworkNodeLifecycle.buildDefaultsValues('0.78.0', consensusNodeImage)?.root.image.tag).to.equal('0.78.0');
  });

  it('should not override the root image in the default mode', (): void => {
    expect(NetworkNodeLifecycle.buildDefaultsValues('v0.77.2', soloContainer)).to.equal(undefined);
  });

  it('should stage the config files and avoid ps when starting the consensus node image', (): void => {
    const start: string = NetworkNodeLifecycle.buildStartCommand(consensusNodeImage);
    expect(start).to.contain('/etc/network-node/config/*');
    expect(start).to.contain('/shared-hapiapp');
    expect(start).to.contain(NetworkNodeLifecycle.buildInstallToolsCommand());
    expect(start).to.contain('data/config/genesis-network.json');
    expect(start).to.not.contain('ps -ef');
  });

  it('should install zip, unzip and curl only when they are missing', (): void => {
    const command: string = NetworkNodeLifecycle.buildInstallToolsCommand();
    for (const tool of ['zip', 'unzip', 'curl']) {
      expect(command).to.contain(`command -v ${tool}`);
    }
    expect(command).to.contain('mkdir -p /var/cache/apt/archives/partial');
    expect(command).to.contain('apt-get install -y -qq --no-install-recommends zip unzip curl');
  });

  it('should find the JVM for both the default and the --app main class when stopping', (): void => {
    const stop: string = NetworkNodeLifecycle.buildStopCommand(consensusNodeImage);
    expect(stop).to.contain('com.hedera.node.app.ServicesMain');
    expect(stop).to.contain('com.swirlds.platform.Browser');
  });

  it('should only change ownership when running as root', (): void => {
    expect(NetworkNodeLifecycle.buildChangeOwnerCommand('/a/saved')).to.equal(
      'if [ "$(id -u)" = "0" ]; then chown -R hedera:hedera /a/saved; fi',
    );
  });
});
