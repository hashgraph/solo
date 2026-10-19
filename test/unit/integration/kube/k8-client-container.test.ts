// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonStub} from 'sinon';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {K8ClientContainer} from '../../../../src/integration/kube/k8-client/resources/container/k8-client-container.js';
import {KubeContainerInvalidPathError} from '../../../../src/integration/kube/errors/kube-container-invalid-path-error.js';
import {KubeContainerOperationFailedError} from '../../../../src/integration/kube/errors/kube-container-operation-failed-error.js';
import {ContainerReference} from '../../../../src/integration/kube/resources/container/container-reference.js';
import {ContainerName} from '../../../../src/integration/kube/resources/container/container-name.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';
import {type Pods} from '../../../../src/integration/kube/resources/pod/pods.js';
import {ResumableCopySource} from '../../../../src/integration/kube/resources/container/resumable-copy-source.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {resetForTest} from '../../../test-container.js';

function kubectlFailure(stderr: string): KubeContainerOperationFailedError {
  return new KubeContainerOperationFailedError(
    'container call: kubectl exec test-pod, failed with code 1',
    new Error(stderr),
  );
}

describe('K8ClientContainer execContainer', (): void => {
  const containerReference: ContainerReference = ContainerReference.of(
    PodReference.of(NamespaceName.of('test-namespace'), PodName.of('test-pod')),
    ContainerName.of('test-container'),
  );

  let containerClient: K8ClientContainer;
  let execKubectlStub: SinonStub;

  beforeEach((): void => {
    resetForTest();
    const pods: Pods = {waitForPodByReference: sinon.stub().resolves({})} as unknown as Pods;
    containerClient = new K8ClientContainer(
      {getCurrentContext: (): string => 'test-context'} as never,
      containerReference,
      pods,
      '',
    );
    execKubectlStub = sinon.stub(containerClient, 'execKubectl' as never);
  });

  describe('K8ClientContainer copyTo', (): void => {
    const containerReference: ContainerReference = ContainerReference.of(
      PodReference.of(NamespaceName.of('test-namespace'), PodName.of('test-pod')),
      ContainerName.of('test-container'),
    );

    let containerClient: K8ClientContainer;
    let temporaryDirectory: string;

    beforeEach((): void => {
      resetForTest();
      const pods: Pods = {waitForPodByReference: sinon.stub().resolves({})} as unknown as Pods;
      containerClient = new K8ClientContainer(
        {getCurrentContext: (): string => 'test-context'} as never,
        containerReference,
        pods,
        '',
      );
      temporaryDirectory = fs.mkdtempSync(PathEx.join(os.tmpdir(), 'k8-client-container-test-'));
    });

    afterEach((): void => {
      if (temporaryDirectory && fs.existsSync(temporaryDirectory)) {
        fs.rmSync(temporaryDirectory, {recursive: true, force: true});
      }
      sinon.restore();
    });

    it('verifies remote copied file size for copyTo', async (): Promise<void> => {
      const localFilePath: string = PathEx.join(temporaryDirectory, 'gnark.jar');
      const fileContent: string = '0123456789';
      fs.writeFileSync(localFilePath, fileContent);

      const destinationDirectory: string = '/opt/hgcapp/services-hedera/HapiApp2.0/data/lib';
      const hasDirectoryStub: SinonStub = sinon.stub(containerClient, 'hasDir').resolves(true);
      const hasFileStub: SinonStub = sinon.stub(containerClient, 'hasFile').resolves(true);
      const execKubectlStub: SinonStub = sinon.stub(containerClient, 'execKubectl' as never) as SinonStub;
      execKubectlStub.resolves('ok');
      const execKubectlCpSpy: SinonStub = sinon.spy(containerClient, 'execKubectlCp' as never) as SinonStub;

      const result: boolean = await containerClient.copyTo(localFilePath, destinationDirectory);

      expect(result).to.be.true;
      expect(execKubectlCpSpy).to.have.been.calledOnce;
      expect(execKubectlStub).to.have.been.calledOnce;
      expect(hasDirectoryStub).to.have.been.calledOnceWith(destinationDirectory);
      expect(hasFileStub).to.have.been.calledOnceWith(PathEx.posixJoin(destinationDirectory, 'gnark.jar'), {
        size: fileContent.length.toString(),
      });
    });

    it('retries the copy and throws when remote copied file size verification fails', async (): Promise<void> => {
      const localFilePath: string = PathEx.join(temporaryDirectory, 'gnark.jar');
      fs.writeFileSync(localFilePath, '0123456789');

      sinon.stub(containerClient, 'hasDir').resolves(true);
      sinon.stub(containerClient, 'hasFile').resolves(false);
      const execKubectlStub: SinonStub = sinon.stub(containerClient, 'execKubectl' as never) as SinonStub;
      execKubectlStub.resolves('ok');
      const execKubectlCpSpy: SinonStub = sinon.spy(containerClient, 'execKubectlCp' as never) as SinonStub;

      try {
        await containerClient.copyTo(localFilePath, '/opt/hgcapp/services-hedera/HapiApp2.0/data/lib');
        expect.fail('Expected copyTo to reject');
      } catch (error) {
        expect(error).to.be.instanceOf(KubeContainerInvalidPathError);
        expect((error as KubeContainerInvalidPathError).message).to.include('copy size verification');
      }

      // a failed remote verification must be retried, not throw on the first attempt: one logical
      // copyTo, three kubectl cp attempts
      expect(execKubectlCpSpy).to.have.been.calledOnce;
      expect(execKubectlStub).to.have.been.calledThrice;
    });
  });

  afterEach((): void => {
    sinon.restore();
  });

  for (const stderr of [
    'error: Internal error occurred: Timeout occurred',
    'Error from server: error dialing backend: dial tcp 10.89.0.2:10250: connect: connection refused',
    'error: unable to upgrade connection: container not found ("postgresql")',
    'error: error reading from server: read unix @->/run/containerd/containerd.sock: read: connection reset by peer',
  ]) {
    it(`retries and succeeds after transient failure: ${stderr}`, async (): Promise<void> => {
      execKubectlStub.onFirstCall().rejects(kubectlFailure(stderr));
      execKubectlStub.onSecondCall().resolves('ok');

      const result: string = await containerClient.execContainer('chmod +x /tmp/init-postgres.sh');

      expect(result).to.equal('ok');
      expect(execKubectlStub).to.have.been.calledTwice;
    });
  }

  it('does not retry a non-transient failure', async (): Promise<void> => {
    const failure: KubeContainerOperationFailedError = kubectlFailure(
      "chmod: cannot access '/tmp/missing.sh': No such file or directory",
    );
    execKubectlStub.rejects(failure);

    try {
      await containerClient.execContainer('chmod +x /tmp/missing.sh');
      expect.fail('Expected execContainer to reject');
    } catch (error) {
      expect(error).to.equal(failure);
    }

    expect(execKubectlStub).to.have.been.calledOnce;
  });

  describe('hasDir', (): void => {
    it('returns true when the probe prints true', async (): Promise<void> => {
      execKubectlStub.resolves('true');

      expect(await containerClient.hasDir('/tmp')).to.be.true;
      expect(execKubectlStub).to.have.been.calledOnce;
    });

    it('returns false when the probe prints false', async (): Promise<void> => {
      execKubectlStub.resolves('false');

      expect(await containerClient.hasDir('/missing')).to.be.false;
      expect(execKubectlStub).to.have.been.calledOnce;
    });

    it('retries when an interrupted exec returns no output, then succeeds', async (): Promise<void> => {
      execKubectlStub.onFirstCall().resolves('');
      execKubectlStub.onSecondCall().resolves('true');

      expect(await containerClient.hasDir('/tmp')).to.be.true;
      expect(execKubectlStub).to.have.been.calledTwice;
    });

    it('throws instead of returning false when every probe returns no usable output', async (): Promise<void> => {
      execKubectlStub.resolves('');

      try {
        await containerClient.hasDir('/tmp');
        expect.fail('Expected hasDir to reject');
      } catch (error) {
        expect(error).to.be.instanceOf(KubeContainerOperationFailedError);
        expect((error as KubeContainerOperationFailedError).message).to.include('hasDir /tmp');
      }

      expect(execKubectlStub).to.have.been.calledThrice;
    });

    it('falls back to /bin/sh when bash is unavailable', async (): Promise<void> => {
      execKubectlStub
        .onFirstCall()
        .rejects(
          kubectlFailure(
            'exec failed: unable to start container process: exec: "bash": executable file not found in $PATH',
          ),
        );
      execKubectlStub.onSecondCall().resolves('true');

      expect(await containerClient.hasDir('/tmp')).to.be.true;
      expect(execKubectlStub.secondCall.args[0]).to.include('/bin/sh');
    });
  });
});

describe('K8ClientContainer copyFileResumable', (): void => {
  const containerReference: ContainerReference = ContainerReference.of(
    PodReference.of(NamespaceName.of('test-namespace'), PodName.of('test-pod')),
    ContainerName.of('test-container'),
  );

  let containerClient: K8ClientContainer;
  let temporaryDirectory: string;

  beforeEach((): void => {
    resetForTest();
    const pods: Pods = {waitForPodByReference: sinon.stub().resolves({})} as unknown as Pods;
    containerClient = new K8ClientContainer(
      {getCurrentContext: (): string => 'test-context'} as never,
      containerReference,
      pods,
      '',
    );
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'resumable-copy-test-'));
  });

  afterEach((): void => {
    sinon.restore();
    fs.rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('skips valid chunks and re-uploads invalid chunks', async (): Promise<void> => {
    const sourcePath: string = path.join(temporaryDirectory, 'source.bin');
    fs.writeFileSync(sourcePath, 'abcdef');

    const execContainerStub: SinonStub = sinon.stub(containerClient, 'execContainer');
    execContainerStub.onCall(0).resolves(''); // destination is invalid
    execContainerStub.onCall(1).resolves(''); // create the remote transfer directory
    execContainerStub.onCall(2).resolves(''); // first chunk is invalid
    execContainerStub.onCall(3).resolves('valid'); // first chunk after upload
    execContainerStub.onCall(4).resolves('valid'); // second chunk is reusable
    execContainerStub.onCall(5).resolves(''); // final assembly
    const copyToStub: SinonStub = sinon.stub(containerClient, 'copyTo').resolves(true);
    const preparedSource: ResumableCopySource = ResumableCopySource.create(sourcePath, 3);

    try {
      await containerClient.copyFileResumable(sourcePath, '/data/target.bin', 3, preparedSource);
    } finally {
      preparedSource.dispose();
    }

    expect(copyToStub).to.have.been.calledOnce;
    expect(execContainerStub).to.have.callCount(6);
  });

  it('throws when the assembled remote file has the wrong checksum', async (): Promise<void> => {
    const sourcePath: string = path.join(temporaryDirectory, 'source.bin');
    fs.writeFileSync(sourcePath, 'abc');

    const failure: KubeContainerOperationFailedError = kubectlFailure('checksum mismatch');
    const execContainerStub: SinonStub = sinon.stub(containerClient, 'execContainer');
    execContainerStub.onCall(0).resolves(''); // destination is invalid
    execContainerStub.onCall(1).resolves(''); // create the remote transfer directory
    execContainerStub.onCall(2).resolves('valid');
    execContainerStub.onCall(3).rejects(failure);

    try {
      await containerClient.copyFileResumable(sourcePath, '/data/target.bin', 3);
      expect.fail('Expected copyFileResumable to reject');
    } catch (error) {
      expect(error).to.equal(failure);
    }
  });

  it('skips transfer when the remote destination is already valid', async (): Promise<void> => {
    const sourcePath: string = path.join(temporaryDirectory, 'source.bin');
    fs.writeFileSync(sourcePath, 'abc');

    const execContainerStub: SinonStub = sinon.stub(containerClient, 'execContainer').resolves('valid');
    const copyToStub: SinonStub = sinon.stub(containerClient, 'copyTo').resolves(true);

    await containerClient.copyFileResumable(sourcePath, '/data/target.bin', 3);

    expect(execContainerStub).to.have.been.calledOnce;
    expect(copyToStub).to.not.have.been.called;
  });
});
