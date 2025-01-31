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

-- Create database & owner
create user :ownerUsername with login password :'ownerPassword';
create database :dbName with owner :ownerUsername;

-- Create roles
create role readonly;
create role readwrite in role readonly;
create role temporary_admin in role readwrite;

-- Create users
create user :graphQLUsername with login password :'graphQLPassword' in role readonly;
create user :grpcUsername with login password :'grpcPassword' in role readonly;
create user :importerUsername with login password :'importerPassword' in role readwrite admin :ownerUsername;
create user :restJavaUsername with login password :'restJavaPassword' in role readonly;
create user :rosettaUsername with login password :'rosettaPassword' in role readonly;
create user :web3Username with login password :'web3Password' in role readonly;
alter user :ownerUsername with createrole;

-- Grant temp schema admin privileges
grant temporary_admin to :ownerUsername;
grant temporary_admin to :importerUsername;

-- Add extensions
\connect :dbName
create extension if not exists btree_gist;
create extension if not exists pg_stat_statements;
create extension if not exists pg_trgm;

-- Create schema
\connect :dbName :ownerUsername
create schema if not exists :dbSchema authorization :ownerUsername;
grant usage on schema :dbSchema to public;
revoke create on schema :dbSchema from public;

-- Create temp table schema
create schema if not exists :tempSchema authorization temporary_admin;
grant usage on schema :tempSchema to public;
revoke create on schema :tempSchema from public;

-- Grant readonly privileges
grant connect on database :dbName to readonly;
grant select on all tables in schema :dbSchema, :tempSchema to readonly;
grant select on all sequences in schema :dbSchema, :tempSchema to readonly;
grant usage on schema :dbSchema, :tempSchema to readonly;
alter default privileges in schema :dbSchema, :tempSchema grant select on tables to readonly;
alter default privileges in schema :dbSchema, :tempSchema grant select on sequences to readonly;

-- Grant readwrite privileges
grant insert, update, delete on all tables in schema :dbSchema to readwrite;
grant usage on all sequences in schema :dbSchema to readwrite;
alter default privileges in schema :dbSchema grant insert, update, delete on tables to readwrite;
alter default privileges in schema :dbSchema grant usage on sequences to readwrite;

-- Alter search path
\connect postgres postgres
alter database :dbName set search_path = :dbSchema, public, :tempSchema;
__SQL__

if [[ -f "${PGHBACONF}.bak" ]]; then
  mv "${PGHBACONF}.bak" "${PGHBACONF}"
  pg_ctl reload
fi
