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
import fs from 'node:fs';
import {SOLO_CACHE_DIR} from '../constants.js';
import {MIRROR_NODE_VERSION} from '../../../version.js';
import {Secret} from '../../integration/kube/resources/secret/secret.js';
import {PassThrough} from 'node:stream';
import {SoloErrors} from '../errors/solo-errors.js';
import {type PackageDownloader} from '../package-downloader.js';
import * as Base64 from 'js-base64';
import {sleep} from '../helpers.js';
import {Duration} from '../time/duration.js';
import {type Pod} from '../../integration/kube/resources/pod/pod.js';
import {type Pods} from '../../integration/kube/resources/pod/pods.js';
import {SemanticVersion} from '../../business/utils/semantic-version.js';
import {MirrorNodeResourceNames, type MirrorNodeDatabaseUser} from '../mirror-node-resource-names.js';

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
    @inject(InjectTokens.PackageDownloader) private readonly downloader?: PackageDownloader,
  ) {
    this.helm = patchInject(helm, InjectTokens.Helm, this.constructor.name);
    this.logger = patchInject(logger, InjectTokens.SoloLogger, this.constructor.name);
    this.k8Factory = patchInject(k8Factory, InjectTokens.K8Factory, this.constructor.name);
    this.chartManager = patchInject(chartManager, InjectTokens.ChartManager, this.constructor.name);
    this.downloader = patchInject(downloader, InjectTokens.PackageDownloader, this.constructor.name);
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

  private static readOptionalSecretValue(secret: Secret, key: string, fallback: string): string {
    const encoded: string | undefined = secret.data[key];
    return encoded ? Base64.decode(encoded) : fallback;
  }

  /**
   * The upstream init script creates the `readonly`, `readwrite` and `temporary_admin` roles unconditionally.
   * Those roles are cluster-wide, so a second mirror node database in the same Postgres would fail on them.
   * Returns the path of a copy of the script in which each of those statements only runs if the role is missing.
   */
  private static writeReusableInitScript(initScriptLocalPath: string): string {
    const script: string = fs.readFileSync(initScriptLocalPath, 'utf8');
    // `$$` is escaped because the statements sit inside an unquoted shell heredoc
    const patched: string = script.replaceAll(
      /^create role (\w+)( in role \w+)?;$/gm,
      (_statement: string, role: string, membership: string | undefined): string =>
        String.raw`do \$\$ begin if not exists (select from pg_roles where rolname = '${role}') then ` +
        String.raw`create role ${role}${membership ?? ''}; end if; end \$\$;`,
    );

    const directory: string = PathEx.join(PathEx.dirname(initScriptLocalPath), 'reusable');
    fs.mkdirSync(directory, {recursive: true});
    const patchedPath: string = PathEx.join(directory, PathEx.basename(initScriptLocalPath));
    fs.writeFileSync(patchedPath, patched);
    return patchedPath;
  }

  public async initializeMirrorNode(
    namespace: NamespaceName,
    context: string,
    prefix: string = 'HIERO',
    names: MirrorNodeResourceNames = MirrorNodeResourceNames.primary(),
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
      await this.downloader.fetchFile(initScriptDownloadUrl, initScriptLocalPath);
    }

    try {
      await k8Container.copyTo(PostgresSharedResource.writeReusableInitScript(initScriptLocalPath), '/tmp');
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
      .read(namespace, names.passwordsSecretName);

    const superUserPassword: string = Base64.decode(postgresPasswordsSecret.data['password']);
    const databaseName: string = Base64.decode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_NAME`]);
    const ownerUsername: string = Base64.decode(mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_OWNER`]);
    const ownerPassword: string = Base64.decode(
      mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_OWNERPASSWORD`],
    );
    const restUsernameEncoded: string | undefined =
      mirrorPasswordsSecret.data[`${prefix}_MIRROR_REST_DB_USERNAME`] ??
      mirrorPasswordsSecret.data[`${prefix}_MIRROR_IMPORTER_DB_RESTUSERNAME`];
    const restUsername: string = restUsernameEncoded
      ? Base64.decode(restUsernameEncoded)
      : names.databaseUsername('rest');
    const usernameOf: (module: string, user: MirrorNodeDatabaseUser) => string = (
      module: string,
      user: MirrorNodeDatabaseUser,
    ): string =>
      PostgresSharedResource.readOptionalSecretValue(
        mirrorPasswordsSecret,
        `${prefix}_MIRROR_${module}_DB_USERNAME`,
        names.databaseUsername(user),
      );
    const importerUsername: string = usernameOf('IMPORTER', 'importer');
    const graphqlUsername: string = usernameOf('GRAPHQL', 'graphql');
    const grpcUsername: string = usernameOf('GRPC', 'grpc');
    const restJavaUsername: string = usernameOf('RESTJAVA', 'restjava');
    const rosettaUsername: string = usernameOf('ROSETTA', 'rosetta');
    const web3Username: string = usernameOf('WEB3', 'web3');

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
          `export IMPORTER_USERNAME=${importerUsername}`,
          `export GRAPHQL_USERNAME=${graphqlUsername}`,
          `export GRPC_USERNAME=${grpcUsername}`,
          `export REST_JAVA_USERNAME=${restJavaUsername}`,
          `export ROSETTA_USERNAME=${rosettaUsername}`,
          `export WEB3_USERNAME=${web3Username}`,
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
          '  reconcile_roles=("${OWNER_USERNAME}" "${IMPORTER_USERNAME}" "${REST_USERNAME}" "${REST_JAVA_USERNAME}" "${WEB3_USERNAME}" "${GRPC_USERNAME}" "${GRAPHQL_USERNAME}" "${ROSETTA_USERNAME}")',
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
          `  for role in ${graphqlUsername} ${grpcUsername} ${importerUsername} mirror_api ${restUsername} ${restJavaUsername} ${rosettaUsername} ${web3Username} ${ownerUsername}; do`,
          '    psql -c "DROP USER IF EXISTS ${role};" 2>/dev/null || true',
          '  done',
          '  # readonly, readwrite and temporary_admin are shared by every mirror node database in this Postgres',
          '  # (the importer migrations hardcode temporary_admin), so they are never dropped here.',
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

  /**
   * Drops the database and the login roles of one mirror node, leaving the shared roles and the
   * databases of the other mirror nodes in the same Postgres untouched.
   */
  public async dropMirrorNode(
    namespace: NamespaceName,
    context: string,
    names: MirrorNodeResourceNames,
  ): Promise<void> {
    const k8Container: Container = this.k8Factory
      .getK8(context)
      .containers()
      .readByRef(await this.resolveContainerReference(namespace, context));

    const statements: string[] = [
      `DROP DATABASE IF EXISTS "${names.databaseName}" WITH (FORCE);`,
      ...Object.values(names.databaseUsernames).map((username: string): string => `DROP ROLE IF EXISTS "${username}";`),
    ];

    for (const statement of statements) {
      try {
        await k8Container.execContainer([
          'bash',
          '-c',
          `PGPASSWORD=$(cat $POSTGRES_PASSWORD_FILE) psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -c '${statement}'`,
        ]);
      } catch (error) {
        // best-effort cleanup: a leftover role or database must not block destroying the mirror node
        this.logger.warn(
          `Failed to run '${statement}' while dropping mirror node database ${names.databaseName}`,
          error,
        );
      }
    }
  }

  public static getMirrorNodeReleaseTag(version: string): string {
    return new SemanticVersion<string>(version).toPrefixedString();
  }
}

export const getMirrorNodeReleaseTag: typeof PostgresSharedResource.getMirrorNodeReleaseTag =
  PostgresSharedResource.getMirrorNodeReleaseTag;
