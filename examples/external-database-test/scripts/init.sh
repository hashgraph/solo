#!/bin/bash
set -e

export HEDERA_MIRROR_DATABASE_NAME="mirror_node"
HEDERA_MIRROR_OWNER="$1"
HEDERA_MIRROR_READ="$2"
HEDERA_MIRROR_READ_PASSWORD="$3"


export HEDERA_MIRROR_GRPC_DB_HOST="localhost"

export HEDERA_MIRROR_IMPORTER_DB_HOST="localhost"
export HEDERA_MIRROR_IMPORTER_DB_NAME="${HEDERA_MIRROR_DATABASE_NAME}"
export HEDERA_MIRROR_IMPORTER_DB_OWNER="${HEDERA_MIRROR_OWNER}"
export HEDERA_MIRROR_IMPORTER_DB_SCHEMA="public"
export HEDERA_MIRROR_IMPORTER_DB_TEMPSCHEMA="temporary"


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
  --set "ownerUsername=${HEDERA_MIRROR_IMPORTER_DB_OWNER}" \
  --set "tempSchema=${HEDERA_MIRROR_IMPORTER_DB_TEMPSCHEMA}" \
  --set "readUsername=${HEDERA_MIRROR_READ}" \
  --set "readPassword=${HEDERA_MIRROR_READ_PASSWORD}" <<__SQL__

-- Create database & owner
create database :dbName with owner :ownerUsername;

-- Create roles
create role readonly;
create role readwrite in role readonly;
create role temporary_admin in role readwrite;

-- Create users
alter user :ownerUsername with createrole;

-- Grant temp schema admin privileges
grant temporary_admin to :ownerUsername;

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

-- Create readonly user with password and grant privileges
create user :readUsername with password :'readPassword';
grant readonly to :readUsername;

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
