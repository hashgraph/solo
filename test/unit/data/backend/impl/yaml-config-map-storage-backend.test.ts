// SPDX-License-Identifier: Apache-2.0

import {YamlConfigMapStorageBackend} from '../../../../../src/data/backend/impl/yaml-config-map-storage-backend.js';
import {expect} from 'chai';
import sinon from 'sinon';
import {K8ClientConfigMap} from '../../../../../src/integration/kube/k8-client/resources/config-map/k8-client-config-map.js';
import {NamespaceName} from '../../../../../src/types/namespace/namespace-name.js';
import {RemoteConfigDataInvalidSoloError} from '../../../../../src/core/errors/classes/config/remote-config-data-invalid-solo-error.js';

describe('YamlConfigMapStorageBackend', (): void => {
  let backend: YamlConfigMapStorageBackend;

  beforeEach((): void => {
    const namespace: NamespaceName = NamespaceName.of('test-ns');
    const configMap: K8ClientConfigMap = new K8ClientConfigMap(namespace, 'test-cm', {}, {});
    backend = new YamlConfigMapStorageBackend(configMap);
  });

  describe('readObject', (): void => {
    it('should parse YAML from readBytes', async (): Promise<void> => {
      const yamlString: string = 'foo: bar\nnum: 42\n';
      const stub: sinon.SinonStub = sinon.stub(backend, 'readBytes').resolves(Buffer.from(yamlString, 'utf8'));
      const result: object = await backend.readObject('some-key');
      expect(result).to.deep.equal({foo: 'bar', num: 42});
      stub.restore();
    });

    it('should throw if readBytes returns empty buffer', async (): Promise<void> => {
      sinon.stub(backend, 'readBytes').resolves(Buffer.from('', 'utf8'));
      await expect(backend.readObject('empty-key')).to.be.rejectedWith('the value is empty');
    });

    it('should throw if readBytes returns undefined', async (): Promise<void> => {
      sinon.stub(backend, 'readBytes').resolves(undefined as never);
      await expect(backend.readObject('missing-key')).to.be.rejectedWith('the value is empty');
    });

    it('should throw on invalid YAML', async (): Promise<void> => {
      sinon.stub(backend, 'readBytes').resolves(Buffer.from('not: [valid, yaml', 'utf8'));
      await expect(backend.readObject('bad-yaml')).to.be.rejectedWith('the value is not parseable as YAML');
    });

    for (const [label, value] of [
      ['whitespace-only', '   \n  \n'],
      ['comment-only', '# nothing here\n'],
      ['a bare scalar', 'truncated-value'],
      ['a sequence', '- one\n- two\n'],
    ] as [string, string][]) {
      it(`should throw when the value is ${label}`, async (): Promise<void> => {
        sinon.stub(backend, 'readBytes').resolves(Buffer.from(value, 'utf8'));
        await expect(backend.readObject('remote-config-data')).to.be.rejectedWith(
          'does not describe a configuration object',
        );
      });
    }

    it('should raise a coded error carrying the captured value and recovery guidance', async (): Promise<void> => {
      const corrupt: string = 'schemaVersion: 1\nclusters: [broken';
      sinon.stub(backend, 'readBytes').resolves(Buffer.from(corrupt, 'utf8'));

      let thrown: RemoteConfigDataInvalidSoloError;
      try {
        await backend.readObject('remote-config-data');
      } catch (error) {
        thrown = error as RemoteConfigDataInvalidSoloError;
      }

      expect(thrown).to.be.instanceOf(RemoteConfigDataInvalidSoloError);
      expect(thrown.getFormattedCode()).to.equal('SOLO-1006');
      expect(thrown.getDocumentUrl()).to.equal('https://solo.hiero.org/docs/troubleshooting/errors/config/SOLO-1006/');
      expect(thrown.meta).to.deep.equal({key: 'remote-config-data', capturedData: corrupt});
      expect(thrown.message).to.include('schemaVersion: 1 clusters: [broken');
      expect(thrown.cause).to.be.instanceOf(Error);

      const steps: string = (thrown.getTroubleshootingSteps() ?? []).join('\n');
      expect(steps).to.include('kubectl get configmap solo-remote-config');
      expect(steps).to.include('solo one-shot single destroy');
      expect(steps).to.include('solo deployment diagnostics debug');
      expect(steps).to.include('https://github.com/hiero-ledger/solo/issues');
    });

    it('should truncate an oversized captured value', async (): Promise<void> => {
      const oversized: string = `key: ${'x'.repeat(20_000)}\nclusters: [broken`;
      sinon.stub(backend, 'readBytes').resolves(Buffer.from(oversized, 'utf8'));

      let thrown: RemoteConfigDataInvalidSoloError;
      try {
        await backend.readObject('remote-config-data');
      } catch (error) {
        thrown = error as RemoteConfigDataInvalidSoloError;
      }

      expect(thrown.meta.capturedData).to.have.lengthOf(8192);
      expect(thrown.message).to.include('(truncated)');
      expect(thrown.message).to.include(`Captured value (${oversized.length} bytes)`);
    });
  });

  describe('writeObject', (): void => {
    it('should write YAML string to writeBytes', async (): Promise<void> => {
      const stub: sinon.SinonStub = sinon.stub(backend, 'writeBytes').resolves();
      const data: object = {foo: 'bar', num: 42};
      await backend.writeObject('some-key', data);
      expect(stub.calledOnce).to.be.true;
      const written: string = stub.firstCall.args[1].toString('utf8');
      expect(written).to.include('foo: bar');
      expect(written).to.include('num: 42');
      stub.restore();
    });

    it('should throw if data is null or undefined', async (): Promise<void> => {
      await expect(backend.writeObject('some-key', undefined as never)).to.be.rejectedWith(
        'data must not be null or undefined',
      );
    });

    it('should throw if writeBytes throws', async (): Promise<void> => {
      sinon.stub(backend, 'writeBytes').rejects(new Error('fail'));
      await expect(backend.writeObject('some-key', {foo: 'bar'})).to.be.rejectedWith(
        'error writing yaml for key: some-key to config map',
      );
    });
  });
});
