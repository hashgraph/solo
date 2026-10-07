// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import {NetworkLoadGeneratorLibraries} from '../../../src/core/network-load-generator-libraries.js';
import {type Container} from '../../../src/integration/kube/resources/container/container.js';

describe('NetworkLoadGeneratorLibraries', (): void => {
  it('installs libsodium23 in one sh exec with apt mirror timeouts and an already-installed guard', async (): Promise<void> => {
    const execContainerStub: SinonStub = sinon.stub().resolves('');
    const container: Container = {execContainer: execContainerStub} as unknown as Container;

    await NetworkLoadGeneratorLibraries.install(container);

    expect(execContainerStub.calledOnce).to.equal(true);
    const [shell, flag, script]: string[] = execContainerStub.firstCall.args[0];
    expect(shell).to.equal('sh');
    expect(flag).to.equal('-c');
    expect(script).to.match(/^set -e; if dpkg -s libsodium23 /);
    expect(script).to.include('Acquire::ForceIPv4 "true"');
    expect(script).to.include('Acquire::http::Timeout "30"');
    expect(script).to.include('apt-get install -y libsodium23');
    expect(script).to.not.include('-qq');
  });
});
