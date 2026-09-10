// SPDX-License-Identifier: Apache-2.0

import {InjectTokens} from '../dependency-injection/inject-tokens.js';
import {type SoloLogger} from '../logging/solo-logger.js';
import {type K8Factory} from '../../integration/kube/k8-factory.js';
import {patchInject} from '../dependency-injection/container-helper.js';
import {inject, injectable} from 'tsyringe-neo';
import {type HelmClient} from '../../integration/helm/helm-client.js';
import {type ChartManager} from '../chart-manager.js';
import {type NamespaceName} from '../../types/namespace/namespace-name.js';
import {PathEx} from '../../business/utils/path-ex.js';
import {ContainerReference} from '../../integration/kube/resources/container/container-reference.js';
import {Templates} from '../templates.js';
import {type Container} from '../../integration/kube/resources/container/container.js';
import {ContainerName} from '../../integration/kube/resources/container/container-name.js';
import * as constants from '../../core/constants.js';
import fs, {createWriteStream, WriteStream} from 'node:fs';
import {SOLO_CACHE_DIR} from '../constants.js';
import {MIRROR_NODE_VERSION} from '../../../version.js';
import {Secret} from '../../integration/kube/resources/secret/secret.js';
import {PassThrough, pipeline} from 'node:stream';
import {promisify} from 'node:util';
import {SoloErrors} from '../errors/solo-errors.js';
import * as Base64 from 'js-base64';
import {sleep} from '../helpers.js';
import {Duration} from '../time/duration.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {type Pods} from '../../integration/kube/resources/pod/pods.js';
import {SemanticVersion} from '../../business/utils/semantic-version.js';

@injectable()
export class PostgresSharedResource {
  private static readonly POSTGRES_LABEL_SELECTOR: string[] = [
    'app.kubernetes.io/name=postgres',
    'app.kubernetes.io/instance=solo-shared-resources',
  ];

  public constructor(
    @inject(InjectTokens.SoloLogger) private readonly logger?: SoloLogger,
    @inject(InjectTokens.K8Factory) private readonly k8Factory?: K8Factory,
    @inject(InjectTokens.Helm) protected readonly helm?: HelmClient,
    @inject(InjectTokens.ChartManager) protected readonly chartManager?: ChartManager,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
  }

  public async waitForPodReady(namespace: NamespaceName, context: string): Promise<void> {
    await this.k8Factory
      .getK8(context)
      .pods()
      .waitForRunningPhase(
        namespace,
        PostgresSharedResource.POSTGRES_LABEL_SELECTOR,
        constants.PODS_RUNNING_MAX_ATTEMPTS,
        constants.PODS_RUNNING_DELAY,
      );
  }

  public async resolveContainerReference(namespace: NamespaceName, context: string): Promise<ContainerReference> {
    const pods: Pods = this.k8Factory.getK8(context).pods();
    const matchingPods: Pod[] = await pods.list(namespace, PostgresSharedResource.POSTGRES_LABEL_SELECTOR);
    const postgresPod: Pod = matchingPods.find((pod: Pod): boolean => Boolean(pod.podReference)) ?? matchingPods[0];
    if (postgresPod?.podReference) {
      return ContainerReference.of(postgresPod.podReference, ContainerName.of('postgresql'));
    }

    throw new SoloErrors.system.postgresPodNotFound(namespace.name);
  }

  private static tryToDecode(value: string): string {
    return Base64.decode(value) || value;
  }

  public async initializeMirrorNode(
    namespace: NamespaceName,
    context: string,
    prefix: string = 'HIERO',
  ): Promise<void> {
    const containerReference: ContainerReference = await this.resolveContainerReference(namespace, context);
    const k8Container: Container = this.k8Factory.getK8(context).containers().readByRef(containerReference);
    const tag: string = PostgresSharedResource.getMirrorNodeReleaseTag(MIRROR_NODE_VERSION);

    // check if path exists recursive PathEx.join(constants.SOLO_CACHE_DIR, 'mirror-node', mirrorRelease, 'init-script.sh')
    if (!fs.existsSync(PathEx.join(SOLO_CACHE_DIR, 'mirror-node', tag))) {
      fs.mkdirSync(PathEx.join(SOLO_CACHE_DIR, 'mirror-node', tag), {recursive: true});
    }
    const initScriptLocalPath: string = PathEx.join(SOLO_CACHE_DIR, 'mirror-node', tag, 'init-postgres.sh');

    // Download and cache init script
    if (!fs.existsSync(initScriptLocalPath)) {
      const initScriptDownloadUrl: string = Templates.renderMirrorNodeDatabaseInitScriptUrl(tag);
      this.logger!.info(`Downloading Mirror Node Postgres init script from ${initScriptDownloadUrl}...`);

      const response: any = await fetch(initScriptDownloadUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download Mirror Node Postgres init script from ${initScriptDownloadUrl}: ${response.status} ${response.statusText}`,
        );
      }

      const fileStream: WriteStream = createWriteStream(initScriptLocalPath);
      const streamPipeline = promisify(pipeline);

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        try {
          while (true) {
            const {done, value} = await reader.read();
            if (done) {
              break;
            }
            // value is a Uint8Array chunk
            await new Promise<void>((resolve, reject): void => {
              fileStream.write(Buffer.from(value), (error: Error): void => (error ? reject(error) : resolve()));
            });
          }
          fileStream.end();
          await new Promise<void>((resolve, reject): void => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          });
        } finally {
          // optional: release the lock if supported
          reader.releaseLock?.();
        }
      } else if (response.body && typeof response.body.pipe === 'function') {
        await streamPipeline(response.body, fileStream);
      } else {
        // Fallback: load into memory and write
        const buffer: Buffer<any> = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(initScriptLocalPath, buffer);
      }
    }

    try {
      await k8Container.copyTo(initScriptLocalPath, '/tmp');
      await k8Container.execContainer('chmod +x /tmp/init-postgres.sh');
    } catch (error) {
      throw new SoloErrors.component.postgresInitScriptCopyFailed(namespace.name, error as Error);
    }

    const sharedResourcesSecrets: Secret[] = await this.k8Factory
      .getK8(context)
      .secrets()
      .list(namespace, ['app.kubernetes.io/instance=solo-shared-resources']);
    const postgresPasswordsSecret: Secret = sharedResourcesSecrets.find(
      (secret: Secret): boolean => secret.name === 'solo-shared-resources-passwords',
    );

    const mirrorPasswordsSecret: Secret = await this.k8Factory
      .getK8(context)
      .secrets()
      .read(namespace, 'mirror-passwords');

    const superUserPassword: string = Base64.decode(postgresPasswordsSecret.data['password']);
    const databaseName: string = Base64.decode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_NAME`]);
    const ownerUsername: string = Base64.decode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_OWNER`]);
    const ownerPassword: string = Base64.decode(
      mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`],
    );
    const restUsernameEncoded: string | undefined =
      mirrorPasswordsSecret.data[`${prefix}_MIRROR_REST_DB_USERNAME`] ??
      mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_RESTUSERNAME`];
    const restUsername: string = restUsernameEncoded ? Base64.decode(restUsernameEncoded) : 'mirror_rest';

    const maxAttempts: number = 3;
    const backoff: number = 2;
    let attempt: number = 1;
    while (attempt < maxAttempts) {
      try {
        const wrapperScriptName: string = 'run-init.sh';

        const wrapperLines: string[] = [
          '#!/usr/bin/env bash',
          'set -e',
          '',
          '# connection and DB vars',
          'export POSTGRES_USER=postgres',
          'export PGUSER=postgres',
          'export PGDATABASE=postgres',
          'export PGHOST=127.0.0.1',
          'export PGPORT=5432',
          `export DB_NAME=${databaseName}`,
          `export OWNER_USERNAME=${ownerUsername}`,
          `export OWNER_PASSWORD=${ownerPassword}`,
          '',
          '# superuser password (from your secrets list)',
          `export SUPERUSER_PASSWORD=${superUserPassword}`,
          '',
          '# build .pgpass with both postgres (superuser) and owner credentials',
          'cat > /tmp/.pgpass <<EOF',
          `127.0.0.1:5432:*:postgres:${superUserPassword}`,
          `127.0.0.1:5432:${databaseName}:${ownerUsername}:${ownerPassword}`,
          'EOF',
          'chmod 600 /tmp/.pgpass',
          'export PGPASSFILE=/tmp/.pgpass',
          '',
          '',
          '# export the other API user passwords used by init script',
          `export GRAPHQL_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_GRAPHQL_DB_PASSWORD`])}`,
          `export GRPC_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_GRPC_DB_PASSWORD`])}`,
          `export IMPORTER_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_PASSWORD`])}`,
          `export REST_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_REST_DB_PASSWORD`])}`,
          `export REST_USERNAME=${restUsername}`,
          `export REST_JAVA_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_RESTJAVA_DB_PASSWORD`])}`,
          `export ROSETTA_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_ROSETTA_DB_PASSWORD`])}`,
          `export WEB3_PASSWORD=${PostgresSharedResource.tryToDecode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_WEB3_DB_PASSWORD`])}`,
          '',
          '# Check for the sentinel comment that marks a fully completed initialization.',
          '# Using a DB comment means the sentinel survives pod restarts and is only written',
          '# after init-postgres.sh completes successfully (see end of this script).',
          `SENTINEL=$(psql -tc "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '${databaseName}'" 2>/dev/null | tr -d '[:space:]')`,
          'if [[ "${SENTINEL}" == "solo-initialized" ]]; then',
          `  echo "Initialization sentinel found on database '${databaseName}' — reconciling role passwords and skipping re-init."`,
          '  # The database and roles already exist, but the mirror-passwords Secret may have been',
          '  # regenerated while this PVC survived a prior destroy, leaving the stored passwords stale.',
          '  # Re-apply the current passwords to every role to avoid an auth mismatch.',
          '  # Guard on role existence so optional roles (graphql/rosetta) are skipped cleanly',
          '  reconcile_roles=("${OWNER_USERNAME}" mirror_importer "${REST_USERNAME}" mirror_rest_java mirror_web3 mirror_grpc mirror_graphql mirror_rosetta)',
          '  reconcile_passwords=("${OWNER_PASSWORD}" "${IMPORTER_PASSWORD}" "${REST_PASSWORD}" "${REST_JAVA_PASSWORD}" "${WEB3_PASSWORD}" "${GRPC_PASSWORD}" "${GRAPHQL_PASSWORD}" "${ROSETTA_PASSWORD}")',
          '  for i in "${!reconcile_roles[@]}"; do',
          "    role_exists=$(psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname = '${reconcile_roles[$i]}'\" 2>/dev/null | tr -d '[:space:]')",
          '    if [[ "${role_exists}" == "1" ]]; then',
          '      psql -c "ALTER USER ${reconcile_roles[$i]} WITH PASSWORD \'${reconcile_passwords[$i]}\';"',
          '    fi',
          '  done',
          '  exit 0',
          'fi',
          '',
          '# Handle partial initialization: database exists but no sentinel means a prior run',
          '# was interrupted mid-script. Drop the database and all mirror node roles/users so',
          '# init-postgres.sh can run cleanly from scratch.',
          `DB_EXISTS=$(psql -tc "SELECT 1 FROM pg_database WHERE datname = '${databaseName}'" 2>/dev/null | tr -d '[:space:]')`,
          'if [[ "${DB_EXISTS}" == "1" ]]; then',
          `  echo "Partial initialization detected: database '${databaseName}' exists but no sentinel. Cleaning up for fresh initialization."`,
          `  psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName}' AND pid <> pg_backend_pid();" 2>/dev/null || true`,
          `  psql -c "DROP DATABASE IF EXISTS ${databaseName};"`,
          `  for role in mirror_graphql mirror_grpc mirror_importer mirror_api ${restUsername} mirror_rest_java mirror_rosetta mirror_web3 ${ownerUsername}; do`,
          '    psql -c "DROP USER IF EXISTS ${role};" 2>/dev/null || true',
          '  done',
          '  psql -c "DROP ROLE IF EXISTS temporary_admin, readwrite, readonly;" 2>/dev/null || true',
          'else',
          '  # Database does not exist — check whether only the owner user was created (crash',
          '  # between CREATE USER and CREATE DATABASE). Drop the orphaned user so the init',
          '  # script can create it again (safe: no database means no owned objects).',
          `  OWNER_EXISTS=$(psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '${ownerUsername}'" 2>/dev/null | tr -d '[:space:]')`,
          '  if [[ "${OWNER_EXISTS}" == "1" ]]; then',
          `    echo "Partial initialization detected: owner '${ownerUsername}' exists but database '${databaseName}' does not. Dropping owner for clean retry."`,
          `    psql -c "DROP USER ${ownerUsername};"`,
          '  fi',
          'fi',
          '',
          '# Run the upstream init script. Not using exec so we can write the sentinel below.',
          '/bin/bash /tmp/init-postgres.sh',
          '',
          '# Write sentinel to mark that initialization completed successfully.',
          `psql -c "COMMENT ON DATABASE ${databaseName} IS 'solo-initialized';"`,
          'echo "Initialization complete — sentinel written."',
        ];

        const wrapper: string = wrapperLines.join('\n');

        const temporaryLocal: string = PathEx.join(constants.SOLO_CACHE_DIR, wrapperScriptName);
        fs.writeFileSync(temporaryLocal, wrapper);
        await k8Container.copyTo(temporaryLocal, '/tmp');
        await k8Container.execContainer(`chmod +x /tmp/${wrapperScriptName}`);

        const outputStream: PassThrough = new PassThrough();
        outputStream.on('data', (chunk: Buffer): void => {
          this.logger.info(`${wrapperScriptName}: ${chunk.toString()}`);
        });

        const errorStream: PassThrough = new PassThrough();
        errorStream.on('data', (chunk: Buffer): void => {
          this.logger.info(`${wrapperScriptName}: ${chunk.toString()}`);
        });

        await k8Container.execContainer(`/bin/bash /tmp/${wrapperScriptName}`, outputStream, errorStream);
        await k8Container.execContainer('rm /tmp/.pgpass');
        await k8Container.execContainer(`rm /tmp/${wrapperScriptName}`);
        fs.rmSync(temporaryLocal);
        break;
      } catch (error) {
        this.logger.error(
          `Failed to run Mirror Node Postgres initialization script in container. Attempt ${attempt} out of ${maxAttempts}: ${error}`,
        );
        attempt++;
        if (attempt >= maxAttempts) {
          throw new SoloErrors.component.postgresInitScriptFailed(attempt, error);
        }
        await sleep(Duration.ofSeconds(backoff * attempt)); // wait before retrying
      }
    }
  }

  public static getMirrorNodeReleaseTag(version: string): string {
    return new SemanticVersion<string>(version).toPrefixedString();
  }
}

export const getMirrorNodeReleaseTag: typeof PostgresSharedResource.getMirrorNodeReleaseTag =
  PostgresSharedResource.getMirrorNodeReleaseTag;
