// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {LocalConfigRuntimeState} from '../../../../src/business/runtime-state/config/local/local-config-runtime-state.js';
import {DeploymentNotFoundError} from '../../../../src/core/errors/classes/deployment/deployment-not-found-error.js';
import {RefreshLocalConfigSourceError} from '../../../../src/core/errors/classes/config/refresh-local-config-source-error.js';
import {IncompleteLocalConfigError} from '../../../../src/core/errors/classes/config/incomplete-local-config-error.js';
import {MigrateLegacyLocalConfigError} from '../../../../src/core/errors/classes/config/migrate-legacy-local-config-error.js';
import {getTemporaryDirectory} from '../../../test-utility.js';
import fs from 'node:fs';
import {PathEx} from '../../../../src/business/utils/path-ex.js';
import {type Realm, type Shard} from '../../../../src/types/index.js';
import {type Deployment} from '../../../../src/business/runtime-state/config/local/deployment.js';
import {type FacadeArray} from '../../../../src/business/runtime-state/collection/facade-array.js';
import {type DeploymentSchema} from '../../../../src/data/schema/model/local/deployment-schema.js';

describe('LocalConfigRuntimeState', (): void => {
  let runtimeState: LocalConfigRuntimeState;
  let basePath: string;
  const testFileName: string = 'local-config.yaml';

  async function createDeployment(): Promise<void> {
    if (!runtimeState.isLoaded) {
      await runtimeState.load();
    }
    const deployment: Deployment = runtimeState.configuration.deployments.addNew();
    deployment.name = 'deployment-1';
    deployment.namespace = 'namespace-1';
    deployment.realm = 1;
    deployment.shard = 2;
    await runtimeState.persist();
    await runtimeState.load();
  }

  const validLegacyConfig: string =
    "userEmailAddress: joe@doe.com\nsoloVersion: '0.35.1'\ndeployments: {}\nclusterRefs: {}\n";

  function legacyConfigFilePath(): string {
    return PathEx.join(basePath, 'cache', testFileName);
  }

  function currentConfigFilePath(): string {
    return PathEx.join(basePath, testFileName);
  }

  function writeLegacyConfig(contents: string): void {
    fs.mkdirSync(PathEx.join(basePath, 'cache'), {recursive: true});
    fs.writeFileSync(legacyConfigFilePath(), contents);
  }

  beforeEach((): void => {
    basePath = getTemporaryDirectory();
    runtimeState = new LocalConfigRuntimeState(basePath, testFileName);
  });

  it('should create a new configuration file', async (): Promise<void> => {
    await runtimeState.persist();
    expect(fs.existsSync(PathEx.join(basePath, testFileName))).to.be.true;
    expect(fs.readFileSync(PathEx.join(basePath, testFileName), 'utf8')).to.not.be.empty;
  });

  it('should load configuration successfully', async (): Promise<void> => {
    await runtimeState.persist();
    await runtimeState.load();
    expect(fs.existsSync(PathEx.join(basePath, testFileName))).to.be.true;
    expect(fs.readFileSync(PathEx.join(basePath, testFileName), 'utf8')).to.not.be.empty;
  });

  it('should return deployments', async (): Promise<void> => {
    await createDeployment();
    const deployments: FacadeArray<Deployment, DeploymentSchema> = runtimeState.configuration.deployments;

    expect(deployments.find((d: Deployment): boolean => d.name === 'deployment-1')).to.not.be.undefined;
  });

  it('should throw DeploymentNotFoundError if deployment is not found', async (): Promise<void> => {
    await runtimeState.load();
    expect((): Deployment => runtimeState.configuration.deploymentByName('non-existent-deployment')).to.throw(
      DeploymentNotFoundError,
    );
  });

  it('should return the realm of a deployment', async (): Promise<void> => {
    await createDeployment();
    const realm: Realm = runtimeState.configuration.realmForDeployment('deployment-1');
    expect(realm).to.equal(1);
  });

  it('should return the shard of a deployment', async (): Promise<void> => {
    await createDeployment();
    const shard: Shard = runtimeState.configuration.shardForDeployment('deployment-1');
    expect(shard).to.equal(2);
  });

  it('should reject a parseable-but-partial config file naming the missing keys and the import command', async (): Promise<void> => {
    const filePath: string = PathEx.join(basePath, testFileName);
    fs.writeFileSync(filePath, 'userIdentity:\n  name: john\n  hostname: localhost\n');

    try {
      await runtimeState.load();
      expect.fail('load() should have thrown IncompleteLocalConfigError');
    } catch (error) {
      expect(error).to.be.instanceOf(IncompleteLocalConfigError);
      const soloError: IncompleteLocalConfigError = error as IncompleteLocalConfigError;
      expect(soloError.message).to.include(filePath);
      expect(soloError.message).to.include('clusterRefs');
      expect(soloError.message).to.include('deployments');
      expect(soloError.getTroubleshootingSteps().join('\n')).to.include('solo deployment config import');
    }
  });

  it('should move the broken config file aside when backing it up', async (): Promise<void> => {
    const filePath: string = PathEx.join(basePath, testFileName);
    const brokenContent: string = 'userIdentity:\n  name: john\n  hostname: localhost\n';
    fs.writeFileSync(filePath, brokenContent);

    const backupFilePath: string = runtimeState.backupInvalidConfigFile();

    expect(backupFilePath).to.equal(`${filePath}.invalid`);
    expect(fs.existsSync(filePath)).to.be.false;
    expect(fs.readFileSync(backupFilePath, 'utf8')).to.equal(brokenContent);
  });

  it('should reject a partial config file missing a single required key', async (): Promise<void> => {
    const filePath: string = PathEx.join(basePath, testFileName);
    fs.writeFileSync(filePath, 'clusterRefs: {}\n');

    try {
      await runtimeState.load();
      expect.fail('load() should have thrown IncompleteLocalConfigError');
    } catch (error) {
      expect(error).to.be.instanceOf(IncompleteLocalConfigError);
      const soloError: IncompleteLocalConfigError = error as IncompleteLocalConfigError;
      expect(soloError.message).to.include('(missing: deployments)');
    }
  });

  it('should still migrate a legacy config file without a schemaVersion', async (): Promise<void> => {
    const filePath: string = PathEx.join(basePath, testFileName);
    fs.writeFileSync(
      filePath,
      'clusterRefs:\n' +
        '  cluster-1: context-1\n' +
        'deployments:\n' +
        '  deployment-legacy:\n' +
        '    clusters:\n' +
        '      - cluster-1\n' +
        '    namespace: namespace-legacy\n' +
        'soloVersion: 0.35.1\n' +
        'userEmailAddress: john.doe@example.com\n',
    );

    await runtimeState.load();
    const deployment: Deployment = runtimeState.configuration.deployments.find(
      (d: Deployment): boolean => d.name === 'deployment-legacy',
    );
    expect(deployment).to.not.be.undefined;
    expect(deployment.namespace).to.equal('namespace-legacy');
  });

  it('should name the file path and suggest config import when the config file is malformed', async (): Promise<void> => {
    const filePath: string = PathEx.join(basePath, testFileName);
    fs.writeFileSync(filePath, 'deployments: [unclosed');

    try {
      await runtimeState.load();
      expect.fail('load() should have thrown RefreshLocalConfigSourceError');
    } catch (error) {
      expect(error).to.be.instanceOf(RefreshLocalConfigSourceError);
      const soloError: RefreshLocalConfigSourceError = error as RefreshLocalConfigSourceError;
      expect(soloError.message).to.include(filePath);
      expect(soloError.getTroubleshootingSteps().join('\n')).to.include('solo deployment config import');
    }
  });

  describe('legacy config migration', (): void => {
    it('migrates a valid legacy config, then removes the legacy file', async (): Promise<void> => {
      writeLegacyConfig(validLegacyConfig);

      await runtimeState.load();

      expect(fs.existsSync(currentConfigFilePath()), 'current config should exist').to.be.true;
      expect(fs.existsSync(legacyConfigFilePath()), 'legacy config should be removed').to.be.false;
      // the migrated config validated and loaded, and the persisted file carries the current schema
      expect(runtimeState.isLoaded, 'config should be loaded').to.be.true;
      expect(fs.readFileSync(currentConfigFilePath(), 'utf8')).to.contain('schemaVersion');
    });

    it('preserves the legacy file and throws when the legacy config is corrupt', async (): Promise<void> => {
      writeLegacyConfig('this: is: not: valid: yaml: [unterminated');

      let caughtError: Error | undefined;
      try {
        await runtimeState.load();
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError, 'a migration error should be thrown').to.be.instanceOf(MigrateLegacyLocalConfigError);
      // the legacy file must never be lost, and the corrupt copy must not be propagated
      expect(fs.existsSync(legacyConfigFilePath()), 'legacy config should be preserved').to.be.true;
      expect(fs.existsSync(currentConfigFilePath()), 'corrupt copy should not be propagated').to.be.false;
    });

    it('removes the redundant legacy file when a current config already exists', async (): Promise<void> => {
      await runtimeState.persist();
      expect(fs.existsSync(currentConfigFilePath())).to.be.true;
      writeLegacyConfig(validLegacyConfig);

      await runtimeState.load();

      expect(fs.existsSync(currentConfigFilePath()), 'current config should remain').to.be.true;
      expect(fs.existsSync(legacyConfigFilePath()), 'redundant legacy config should be removed').to.be.false;
    });
  });
});
