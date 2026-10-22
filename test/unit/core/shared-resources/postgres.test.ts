// SPDX-License-Identifier: Apache-2.0

import {expect} from 'chai';
import {afterEach, beforeEach, describe, it} from 'mocha';
import sinon, {type SinonSpyCall} from 'sinon';
import fs from 'node:fs';
import * as Base64 from 'js-base64';

import {PostgresSharedResource} from '../../../../src/core/shared-resources/postgres.js';
import {MirrorNodeResourceNames} from '../../../../src/core/mirror-node-resource-names.js';
import {type SoloLogger} from '../../../../src/core/logging/solo-logger.js';
import {type K8Factory} from '../../../../src/integration/kube/k8-factory.js';
import {type HelmClient} from '../../../../src/integration/helm/helm-client.js';
import {type ChartManager} from '../../../../src/core/chart-manager.js';
import {type PackageDownloader} from '../../../../src/core/package-downloader.js';
import {NamespaceName} from '../../../../src/types/namespace/namespace-name.js';
import {SoloError} from '../../../../src/core/errors/solo-error.js';
import * as constants from '../../../../src/core/constants.js';
import {type AnyObject} from '../../../../src/types/aliases.js';
import {PodReference} from '../../../../src/integration/kube/resources/pod/pod-reference.js';
import {PodName} from '../../../../src/integration/kube/resources/pod/pod-name.js';

const encode: (s: string) => string = (s: string): string => Base64.encode(s);

describe('PostgresSharedResource', (): void => {
  const namespace: NamespaceName = NamespaceName.of('test-namespace');
  const context: string = 'test-context';

  let loggerStub: SoloLogger;
  let helmStub: HelmClient;
  let chartManagerStub: ChartManager;
  let k8FactoryStub: K8Factory;
  let podsStub: AnyObject;
  let containersStub: AnyObject;
  let secretsStub: AnyObject;
  let k8Stub: AnyObject;
  let k8ContainerStub: AnyObject;
  let downloaderStub: {fetchFile: sinon.SinonStub};
  let postgres: PostgresSharedResource;
  const postgresPodReference: PodReference = PodReference.of(namespace, PodName.of('solo-shared-resources-postgres-0'));

  beforeEach((): void => {
    helmStub = sinon.stub() as any;
    chartManagerStub = sinon.stub() as any;

    loggerStub = sinon.stub() as any;
    loggerStub.info = sinon.stub();
    loggerStub.error = sinon.stub();
    loggerStub.warn = sinon.stub();

    k8ContainerStub = {
      copyTo: sinon.stub().resolves(),
      execContainer: sinon.stub().resolves(),
    };

    podsStub = {
      waitForRunningPhase: sinon.stub().resolves(),
      list: sinon.stub().resolves([{podReference: postgresPodReference}]),
    };

    secretsStub = {
      list: sinon.stub().resolves([]),
      read: sinon.stub().resolves({}),
    };

    containersStub = {
      readByRef: sinon.stub().returns(k8ContainerStub),
    };

    k8Stub = {
      pods: sinon.stub().returns(podsStub),
      containers: sinon.stub().returns(containersStub),
      secrets: sinon.stub().returns(secretsStub),
    };

    k8FactoryStub = sinon.stub() as any;
    (k8FactoryStub as any).getK8 = sinon.stub().returns(k8Stub);

    downloaderStub = {fetchFile: sinon.stub().resolves()};

    postgres = new PostgresSharedResource(
      loggerStub,
      k8FactoryStub,
      helmStub,
      chartManagerStub,
      downloaderStub as unknown as PackageDownloader,
    );
  });

  afterEach((): void => {
    sinon.restore();
  });

  describe('waitForPodReady()', (): void => {
    it('calls waitForRunningPhase with postgres labels', async (): Promise<void> => {
      await postgres.waitForPodReady(namespace, context);

      expect(k8FactoryStub.getK8).to.have.been.calledWith(context);
      expect(podsStub.waitForRunningPhase).to.have.been.calledOnce;

      const [, labels] = podsStub.waitForRunningPhase.firstCall.args;
      expect(labels).to.include('app.kubernetes.io/name=postgres');
      expect(labels).to.include('app.kubernetes.io/instance=solo-shared-resources');
    });

    it('passes the namespace and configured constants for max attempts and delay', async (): Promise<void> => {
      await postgres.waitForPodReady(namespace, context);

      const [passedNamespace, , maxAttempts, delay] = podsStub.waitForRunningPhase.firstCall.args;
      expect(passedNamespace).to.equal(namespace);
      expect(maxAttempts).to.equal(constants.PODS_RUNNING_MAX_ATTEMPTS);
      expect(delay).to.equal(constants.PODS_RUNNING_DELAY);
    });
  });

  describe('initializeMirrorNode()', (): void => {
    const postgresPasswordsSecret: {name: string; data: {password: string}} = {
      name: 'solo-shared-resources-passwords',
      data: {password: encode('superpassword')},
    };

    const mirrorPasswordsSecret: AnyObject = {
      data: {
        HIERO_MIRROR_IMPORTER_DB_NAME: encode('mirror_node'),
        HIERO_MIRROR_IMPORTER_DB_OWNER: encode('mirror_node_owner'),
        HIERO_MIRROR_IMPORTER_DB_OWNERPASSWORD: encode('ownerpass'),
        HIERO_MIRROR_GRAPHQL_DB_PASSWORD: encode('graphqlpass'),
        HIERO_MIRROR_GRPC_DB_PASSWORD: encode('grpcpass'),
        HIERO_MIRROR_IMPORTER_DB_PASSWORD: encode('importerpass'),
        HIERO_MIRROR_REST_DB_PASSWORD: encode('restpass'),
        HIERO_MIRROR_REST_DB_USERNAME: encode('mirror_rest'),
        HIERO_MIRROR_RESTJAVA_DB_PASSWORD: encode('restjavapass'),
        HIERO_MIRROR_ROSETTA_DB_PASSWORD: encode('rosettapass'),
        HIERO_MIRROR_WEB3_DB_PASSWORD: encode('web3pass'),
      },
    };

    let existsSyncStub: sinon.SinonStub;
    let mkdirSyncStub: sinon.SinonStub;
    let writeFileSyncStub: sinon.SinonStub;
    let readFileSyncStub: sinon.SinonStub;

    beforeEach((): void => {
      secretsStub.list.resolves([postgresPasswordsSecret]);
      secretsStub.read.resolves(mirrorPasswordsSecret);

      // Simulate init script already cached so we skip the download path
      existsSyncStub = sinon.stub(fs, 'existsSync').returns(true);
      mkdirSyncStub = sinon.stub(fs, 'mkdirSync');
      writeFileSyncStub = sinon.stub(fs, 'writeFileSync');
      readFileSyncStub = sinon
        .stub(fs, 'readFileSync')
        .returns(
          'create role readonly;\ncreate role readwrite in role readonly;\ncreate role temporary_admin in role readwrite;\n',
        );
      sinon.stub(fs, 'rmSync');
    });

    it('makes the creation of the shared roles idempotent in the init script it copies', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      expect(readFileSyncStub).to.have.been.calledWith(sinon.match(/init-postgres\.sh$/), 'utf8');
      const patchedScript: string = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('reusable'))!
        .args[1] as string;
      expect(patchedScript).to.include(
        String.raw`do \$\$ begin if not exists (select from pg_roles where rolname = 'readwrite') then create role readwrite in role readonly; end if; end \$\$;`,
      );
      expect(patchedScript).to.not.match(/^create role/m);
    });

    it('initializes the database, users and secret of a mirror node with suffixed names', async (): Promise<void> => {
      const names: MirrorNodeResourceNames = MirrorNodeResourceNames.forId(2);
      secretsStub.read.resolves({
        data: {
          ...mirrorPasswordsSecret.data,
          HIERO_MIRROR_IMPORTER_DB_NAME: encode(names.databaseName),
          HIERO_MIRROR_IMPORTER_DB_USERNAME: encode(names.databaseUsername('importer')),
          HIERO_MIRROR_GRPC_DB_USERNAME: encode(names.databaseUsername('grpc')),
        },
      });

      await postgres.initializeMirrorNode(namespace, context, 'HIERO', names);

      expect(secretsStub.read).to.have.been.calledWith(namespace, 'mirror-passwords-2');
      const writtenContent: string = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('run-init'))!
        .args[1] as string;
      expect(writtenContent).to.include('export DB_NAME=mirror_node_2');
      expect(writtenContent).to.include('export IMPORTER_USERNAME=mirror_importer_2');
      expect(writtenContent).to.include('export GRPC_USERNAME=mirror_grpc_2');
      expect(writtenContent).to.include('export WEB3_USERNAME=mirror_web3');
      expect(writtenContent).to.not.include('DROP ROLE IF EXISTS temporary_admin');
    });

    it('reads secrets from correct labels and secret names', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      expect(secretsStub.list).to.have.been.calledWith(namespace, ['app.kubernetes.io/instance=solo-shared-resources']);
      expect(secretsStub.read).to.have.been.calledWith(namespace, 'mirror-passwords');
    });

    it('copies check script, init script, and wrapper script to the postgres pod', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      expect(k8ContainerStub.copyTo).to.have.been.calledTwice;
      for (const call of k8ContainerStub.copyTo.getCalls()) {
        expect(call.args[1]).to.equal('/tmp');
      }
    });

    it('executes the wrapper script inside the container', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      const execCalls: string[] = k8ContainerStub.execContainer.args.map((a: AnyObject[]): AnyObject => a[0]);
      expect(execCalls.some((c: string): boolean => c.includes('/bin/bash /tmp/run-init.sh'))).to.be.true;
    });

    it('wrapper script contains correct DB_NAME and OWNER_USERNAME from secrets', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      const wrapperArguments: string[] = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('run-init'))!.args;
      const writtenContent: string = wrapperArguments[1] as string;
      expect(writtenContent).to.include('export DB_NAME=mirror_node');
      expect(writtenContent).to.include('export OWNER_USERNAME=mirror_node_owner');
    });

    it('reads the initialization sentinel from the database shared-object comment', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      const wrapperArguments: string[] = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('run-init'))!.args;
      const writtenContent: string = wrapperArguments[1] as string;
      expect(writtenContent).to.include("SELECT shobj_description(oid, 'pg_database') FROM pg_database");
      expect(writtenContent).to.not.include("SELECT obj_description(oid, 'pg_database') FROM pg_database");
    });

    it('drops legacy and current REST users during partial initialization cleanup', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      const wrapperArguments: string[] = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('run-init'))!.args;
      const writtenContent: string = wrapperArguments[1] as string;
      expect(writtenContent).to.include('mirror_api mirror_rest mirror_rest_java');
    });

    it('wrapper script contains all required service passwords', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      const wrapperArguments: string[] = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('run-init'))!.args;
      const writtenContent: string = wrapperArguments[1] as string;
      expect(writtenContent).to.include('export GRAPHQL_PASSWORD=graphqlpass');
      expect(writtenContent).to.include('export GRPC_PASSWORD=grpcpass');
      expect(writtenContent).to.include('export IMPORTER_PASSWORD=importerpass');
      expect(writtenContent).to.include('export REST_PASSWORD=restpass');
      expect(writtenContent).to.include('export REST_USERNAME=mirror_rest');
      expect(writtenContent).to.not.include('create user :restUsername');
      expect(writtenContent).to.not.include('export CREATE_MIRROR_API_USER=true');
      expect(writtenContent).to.include('export REST_JAVA_PASSWORD=restjavapass');
      expect(writtenContent).to.include('export ROSETTA_PASSWORD=rosettapass');
      expect(writtenContent).to.include('export WEB3_PASSWORD=web3pass');
    });

    it('uses a custom prefix when provided', async (): Promise<void> => {
      const customMirrorPasswordsSecret: AnyObject = {
        data: {
          CUSTOM_MIRROR_IMPORTER_DB_NAME: encode('custom_db'),
          CUSTOM_MIRROR_IMPORTER_DB_OWNER: encode('custom_owner'),
          CUSTOM_MIRROR_IMPORTER_DB_OWNERPASSWORD: encode('custom_ownerpass'),
          CUSTOM_MIRROR_GRAPHQL_DB_PASSWORD: encode('graphqlpass'),
          CUSTOM_MIRROR_GRPC_DB_PASSWORD: encode('grpcpass'),
          CUSTOM_MIRROR_IMPORTER_DB_PASSWORD: encode('importerpass'),
          CUSTOM_MIRROR_REST_DB_PASSWORD: encode('restpass'),
          CUSTOM_MIRROR_REST_DB_USERNAME: encode('custom_rest'),
          CUSTOM_MIRROR_RESTJAVA_DB_PASSWORD: encode('restjavapass'),
          CUSTOM_MIRROR_ROSETTA_DB_PASSWORD: encode('rosettapass'),
          CUSTOM_MIRROR_WEB3_DB_PASSWORD: encode('web3pass'),
        },
      };
      secretsStub.read.resolves(customMirrorPasswordsSecret);

      await postgres.initializeMirrorNode(namespace, context, 'CUSTOM');

      const wrapperArguments: string[] = writeFileSyncStub
        .getCalls()
        .find((call: SinonSpyCall<string[], string>): boolean => (call.args[0] as string).includes('run-init'))!.args;
      const writtenContent: string = wrapperArguments[1] as string;
      expect(writtenContent).to.include('export DB_NAME=custom_db');
      expect(writtenContent).to.include('export OWNER_USERNAME=custom_owner');
      expect(writtenContent).to.include('export REST_USERNAME=custom_rest');
    });

    it('uses the postgres pod from namespace zero', async (): Promise<void> => {
      await postgres.initializeMirrorNode(namespace, context);

      const containerReference: AnyObject = containersStub.readByRef.firstCall.args[0];
      expect(containerReference.parentReference.name.name).to.equal(postgresPodReference.name.name);
    });

    it('throws SoloError when container copy fails', async (): Promise<void> => {
      k8ContainerStub.copyTo.rejects(new Error('copy failed'));

      await expect(postgres.initializeMirrorNode(namespace, context)).to.be.rejectedWith(
        SoloError,
        'Failed to copy Mirror Node Postgres initialization script to container',
      );
    });

    it('retries execution and throws SoloError after max attempts', async (): Promise<void> => {
      // chmod calls must succeed (they are in the outer try-catch that throws immediately).
      // Only the actual bash script execution should fail to exercise the retry loop.
      k8ContainerStub.execContainer.callsFake((cmd: string): Promise<void> => {
        if (cmd.startsWith('chmod')) {
          return Promise.resolve();
        }
        return Promise.reject(new Error('exec failed'));
      });

      await expect(postgres.initializeMirrorNode(namespace, context)).to.be.rejectedWith(SoloError);
      expect(loggerStub.error).to.have.been.called;
    });

    it('skips downloading init script when already cached', async (): Promise<void> => {
      // existsSync returns true — simulating cached file
      await postgres.initializeMirrorNode(namespace, context);

      expect(downloaderStub.fetchFile).to.not.have.been.called;
    });

    it('creates cache directory and downloads init script when not cached', async (): Promise<void> => {
      existsSyncStub.restore();
      // First call (directory check) returns false, second (file check) returns false
      existsSyncStub = sinon.stub(fs, 'existsSync');
      existsSyncStub.onFirstCall().returns(false);
      existsSyncStub.onSecondCall().returns(false);

      await postgres.initializeMirrorNode(namespace, context);

      expect(mkdirSyncStub).to.have.been.calledWith(sinon.match(/mirror-node/), {recursive: true});
      expect(downloaderStub.fetchFile).to.have.been.calledOnce;
      const [downloadUrl, destinationPath]: string[] = downloaderStub.fetchFile.firstCall.args;
      expect(downloadUrl).to.include('hiero-mirror-node');
      expect(downloadUrl).to.include('init.sh');
      expect(destinationPath).to.match(/init-postgres\.sh$/);
    });

    it('throws when init script download fails', async (): Promise<void> => {
      existsSyncStub.restore();
      existsSyncStub = sinon.stub(fs, 'existsSync');
      existsSyncStub.onFirstCall().returns(false);
      existsSyncStub.onSecondCall().returns(false);

      const downloadFailure: Error = new Error('download failed');
      downloaderStub.fetchFile.rejects(downloadFailure);

      await expect(postgres.initializeMirrorNode(namespace, context)).to.be.rejectedWith(downloadFailure);
      expect(k8ContainerStub.copyTo).to.not.have.been.called;
    });
  });

  describe('dropMirrorNode()', (): void => {
    it('drops the database and every login role of the mirror node', async (): Promise<void> => {
      await postgres.dropMirrorNode(namespace, context, MirrorNodeResourceNames.forId(2));

      const commands: string[] = k8ContainerStub.execContainer.args.map((a: AnyObject[]): string =>
        (a[0] as string[]).join(' '),
      );
      expect(commands.some((c: string): boolean => c.includes('DROP DATABASE IF EXISTS "mirror_node_2" WITH (FORCE);')))
        .to.be.true;
      expect(commands.some((c: string): boolean => c.includes('DROP ROLE IF EXISTS "mirror_importer_2";'))).to.be.true;
      expect(commands.some((c: string): boolean => c.includes('DROP ROLE IF EXISTS "mirror_node_2";'))).to.be.true;
      expect(commands.some((c: string): boolean => c.includes('temporary_admin'))).to.be.false;
    });

    it('keeps going and only warns when a statement fails', async (): Promise<void> => {
      k8ContainerStub.execContainer.rejects(new Error('boom'));

      await postgres.dropMirrorNode(namespace, context, MirrorNodeResourceNames.forId(2));

      expect(k8ContainerStub.execContainer.callCount).to.equal(9);
      expect(loggerStub.warn).to.have.callCount(9);
    });
  });

  describe('getMirrorNodeReleaseTag()', (): void => {
    it('preserves pre-release suffixes', (): void => {
      expect(PostgresSharedResource.getMirrorNodeReleaseTag('v0.153.0-rc2')).to.equal('v0.153.0-rc2');
    });

    it('adds v prefix when missing', (): void => {
      expect(PostgresSharedResource.getMirrorNodeReleaseTag('0.153.0-rc2')).to.equal('v0.153.0-rc2');
    });
  });
});
