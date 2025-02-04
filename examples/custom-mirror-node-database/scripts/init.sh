#!/bin/bash
set -e

export HEDERA_MIRROR_DATABASE_NAME="mirror_node"

export HEDERA_MIRROR_GRAPHQL_DB_HOST="localhost"
export HEDERA_MIRROR_GRAPHQL_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_GRAPHQL_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_GRAPHQL_DB_USERNAME="mirror_graphql"

export HEDERA_MIRROR_GRPC_DB_HOST="localhost"
export HEDERA_MIRROR_GRPC_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_GRPC_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_GRPC_DB_USERNAME="mirror_grpc"

export HEDERA_MIRROR_IMPORTER_DB_HOST="localhost"
export HEDERA_MIRROR_IMPORTER_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_IMPORTER_DB_OWNER="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_IMPORTER_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_IMPORTER_DB_RESTPASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_IMPORTER_DB_RESTUSERNAME="mirror_rest"
export HEDERA_MIRROR_IMPORTER_DB_SCHEMA="public"
export HEDERA_MIRROR_IMPORTER_DB_TEMPSCHEMA="temporary"
export HEDERA_MIRROR_IMPORTER_DB_USERNAME="mirror_importer"

export HEDERA_MIRROR_RESTJAVA_DB_HOST="localhost"
export HEDERA_MIRROR_RESTJAVA_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_RESTJAVA_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_RESTJAVA_DB_USERNAME="mirror_rest_java"

export HEDERA_MIRROR_REST_DB_HOST="localhost"
export HEDERA_MIRROR_REST_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_REST_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_REST_DB_USERNAME="mirror_rest"

export HEDERA_MIRROR_ROSETTA_DB_HOST="localhost"
export HEDERA_MIRROR_ROSETTA_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_ROSETTA_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_ROSETTA_DB_USERNAME="mirror_rosetta"

export HEDERA_MIRROR_WEB3_DB_HOST="localhost"
export HEDERA_MIRROR_WEB3_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_WEB3_DB_PASSWORD="XXXXXXXXXXXX"
export HEDERA_MIRROR_WEB3_DB_USERNAME="mirror_web3"

PGHBACONF="/opt/bitnami/postgresql/conf/pg_hba.conf"
if [[ -f "${PGHBACONF}" ]]; then
  cp "${PGHBACONF}" "${PGHBACONF}.bak"
  echo "local all all trust" > "${PGHBACONF}"
  pg_ctl reload
fi

psql -d "user=postgres connect_timeout=3" \
  --set ON_ERROR_STOP=1 \
  --set "dbName=${HEDERA_MIRROR_IMPORTER_DB_NAME}" \
  --set "dbSchema=${HEDERA_MIRROR_IMPORTER_DB_SCHEMA}" \
  --set "graphQLPassword=${HEDERA_MIRROR_GRAPHQL_DB_PASSWORD}" \
  --set "graphQLUsername=${HEDERA_MIRROR_GRAPHQL_DB_USERNAME}" \
  --set "grpcPassword=${HEDERA_MIRROR_GRPC_DB_PASSWORD}" \
  --set "grpcUsername=${HEDERA_MIRROR_GRPC_DB_USERNAME}" \
  --set "importerPassword=${HEDERA_MIRROR_IMPORTER_DB_PASSWORD}" \
  --set "importerUsername=${HEDERA_MIRROR_IMPORTER_DB_USERNAME}" \
  --set "ownerUsername=${HEDERA_MIRROR_IMPORTER_DB_OWNER}" \
  --set "ownerPassword=${HEDERA_MIRROR_IMPORTER_DB_OWNERPASSWORD}" \
  --set "restPassword=${HEDERA_MIRROR_IMPORTER_DB_RESTPASSWORD}" \
  --set "restUsername=${HEDERA_MIRROR_IMPORTER_DB_RESTUSERNAME}" \
  --set "restJavaPassword=${HEDERA_MIRROR_RESTJAVA_DB_PASSWORD}" \
  --set "restJavaUsername=${HEDERA_MIRROR_RESTJAVA_DB_USERNAME}" \
  --set "rosettaPassword=${HEDERA_MIRROR_ROSETTA_DB_PASSWORD}" \
  --set "rosettaUsername=${HEDERA_MIRROR_ROSETTA_DB_USERNAME}" \
  --set "web3Password=${HEDERA_MIRROR_WEB3_DB_PASSWORD}" \
  --set "web3Username=${HEDERA_MIRROR_WEB3_DB_USERNAME}" \
  --set "tempSchema=${HEDERA_MIRROR_IMPORTER_DB_TEMPSCHEMA}" <<__SQL__

create user :ownerUsername with login password :'ownerPassword';
create database :dbName with owner :ownerUsername;

create extension if not exists btree_gist;
create extension if not exists pg_trgm;
create extension if not exists pg_stat_statements;

create role readonly;
create role readwrite in role readonly;
create role temporary_admin in role readwrite;

grant temporary_admin to postgres;

create schema if not exists temporary authorization temporary_admin;
grant usage on schema temporary to public;
revoke create on schema temporary from public;

grant usage on schema public to public;
revoke create on schema public from public;

-- grant temporary_admin to mirror_node;

grant usage on schema temporary to public;
revoke create on schema temporary from public;

grant connect on database mirror_node to readonly;
grant select on all tables in schema public, temporary to readonly;
grant select on all sequences in schema public, temporary to readonly;
grant usage on schema public, temporary to readonly;
alter default privileges in schema public, temporary grant select on tables to readonly;
alter default privileges in schema public, temporary grant select on sequences to readonly;

grant insert, update, delete on all tables in schema public to readwrite;
grant usage on all sequences in schema public to readwrite;
alter default privileges in schema public grant insert, update, delete on tables to readwrite;
alter default privileges in schema public grant usage on sequences to readwrite;

alter database mirror_node set search_path = public, temporary;

__SQL__

if [[ -f "${PGHBACONF}.bak" ]]; then
  mv "${PGHBACONF}.bak" "${PGHBACONF}"
  pg_ctl reload
fi
