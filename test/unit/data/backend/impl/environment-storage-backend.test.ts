// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import {EnvironmentStorageBackend} from '../../../../../src/data/backend/impl/environment-storage-backend.js';
import {StorageOperation} from '../../../../../src/data/backend/api/storage-operation.js';
import {EnvironmentAliasRegistry} from '../../../../../src/data/schema/decorators/environment-alias-registry.js';
import {SoloConfigSchema} from '../../../../../src/data/schema/model/solo/solo-config-schema.js';
import {EnvironmentScope} from '../../../../helpers/environment-scope.js';

describe('EnvironmentStorageBackend', (): void => {
  beforeEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
    EnvironmentAliasRegistry.registerRootSchema(SoloConfigSchema);
  });

  afterEach((): void => {
    EnvironmentAliasRegistry.resetRootSchemas();
  });

  it('test isSupported', (): void => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    expect(backend.isSupported(StorageOperation.List)).to.be.true;
    expect(backend.isSupported(StorageOperation.ReadBytes)).to.be.true;
    expect(backend.isSupported(StorageOperation.WriteBytes)).to.be.false;
    expect(backend.isSupported(StorageOperation.Delete)).to.be.false;
    expect(backend.isSupported(StorageOperation.ReadObject)).to.be.false;
  });

  it('variableNameFor omits the prefix when none is configured', (): void => {
    expect(new EnvironmentStorageBackend().variableNameFor('tss.readyMaxAttempts')).to.equal('TSS_READY_MAX_ATTEMPTS');
  });

  it(
    'list ignores a variable no config key generates',
    EnvironmentScope.with({SOLO_CHARTS_DIR: '/tmp/charts'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
      expect(await backend.list()).to.not.include('charts.dir');
    }),
  );

  // The prefix is normalized before use, so these spell the same thing. A caller passing the separator
  // itself must not produce 'SOLO__TSS_...' and silently read nothing.
  for (const prefix of ['SOLO', 'SOLO_', 'solo']) {
    it(
      `treats the prefix '${prefix}' as SOLO_`,
      EnvironmentScope.with({SOLO_HELM_CHART_DIRECTORY: '/tmp/charts'}, async (): Promise<void> => {
        const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend(prefix);
        expect(backend.variableNameFor('helmChart.directory')).to.equal('SOLO_HELM_CHART_DIRECTORY');
        expect(await backend.list()).to.include('helmChart.directory');
      }),
    );
  }

  // Regression: an empty SOLO_HOME_DIR was listed as 'home.dir' but rejected by readBytes, aborting
  // startup with "Failed to read environment variable: home.dir".
  for (const value of ['', ' '.repeat(3)]) {
    it(
      `list ignores an environment variable set to '${value}'`,
      EnvironmentScope.with({SOLO_TSS_READY_MAX_ATTEMPTS: value}, async (): Promise<void> => {
        const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('SOLO');
        expect(await backend.list()).to.not.include('tss.readyMaxAttempts');
      }),
    );
  }

  it(
    'readBytes treats a blank environment variable as not found',
    EnvironmentScope.with({ENV_TEST_NBR1: ' '.repeat(3)}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('env');
      try {
        await backend.readBytes('test.nbr1');
        expect.fail();
      } catch (error) {
        expect(error.message).to.include('key not found');
      }
    }),
  );

  it('list with no process.env', async (): Promise<void> => {
    const environment: NodeJS.ProcessEnv = process.env;
    try {
      delete process.env;
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
      const keys: string[] = await backend.list();
      expect(keys).to.be.an('array');
      expect(keys).to.have.lengthOf(0);
    } finally {
      process.env = environment;
    }
  });

  it(
    'readBytes from environment variable with prefix',
    EnvironmentScope.with({ENV_TEST_NBR1: '42'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend('env');
      expect(Buffer.from(await backend.readBytes('test.nbr1')).toString()).to.equal('42');
    }),
  );

  it(
    'readBytes from environment variable',
    EnvironmentScope.with({ENV_TEST_NBR1: '42'}, async (): Promise<void> => {
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
      expect(Buffer.from(await backend.readBytes('env.test.nbr1')).toString()).to.equal('42');
    }),
  );

  it('readBytes with empty key', async (): Promise<void> => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    try {
      await backend.readBytes('');
      expect.fail();
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.equal('key must not be null, undefined, or empty');
    }
  });

  it('readBytes with no process.env', async (): Promise<void> => {
    const environment: NodeJS.ProcessEnv = process.env;
    try {
      delete process.env;
      const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
      try {
        await backend.readBytes('test');
        expect.fail();
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('key not found');
      }
    } finally {
      process.env = environment;
    }
  });

  it('writeBytes', async (): Promise<void> => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    try {
      await backend.writeBytes('test', Buffer.from('test'));
      expect.fail();
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.equal('writeBytes is not supported by the environment storage backend');
    }
  });

  it('delete', async (): Promise<void> => {
    const backend: EnvironmentStorageBackend = new EnvironmentStorageBackend();
    try {
      await backend.delete('test');
      expect.fail();
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.equal('delete is not supported by the environment storage backend');
    }
  });
});
