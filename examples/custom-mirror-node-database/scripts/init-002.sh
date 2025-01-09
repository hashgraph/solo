cat > init2.sh << 'EOF'
#!/bin/bash
set -e

# Define PostgreSQL host and credentials
export PG_HOST="my-postgresql.database.svc.cluster.local"
export PG_USER="postgres"
export PG_PASSWORD="XXXXXXXXXXXX"
export PG_DB="mirror_node"

# Execute the SQL commands
psql -h "$PG_HOST" -U "$PG_USER" -d "$PG_DB" <<EOF
DO
$$
BEGIN
  CREATE OR REPLACE FUNCTION if_role_not_exists(rolename name, sql text) RETURNS text AS
  $$
  BEGIN
    IF NOT EXISTS (SELECT * FROM pg_roles WHERE rolname = rolename) THEN
      EXECUTE sql;
      RETURN format('Executed ''%s''', sql);
    ELSE
      RETURN format('Role ''%s'' already exists', rolename);
    END IF;
  END;
  $$
  LANGUAGE plpgsql;

  -- Create owner
  PERFORM if_role_not_exists('postgres', 'CREATE USER postgres WITH CREATEROLE LOGIN PASSWORD ''XXXXXXXXXXXX''');
  ALTER DATABASE mirror_node SET search_path = public, public, temporary;
  ALTER DATABASE mirror_node OWNER TO postgres;

  -- Create roles
  PERFORM if_role_not_exists('readonly', 'CREATE ROLE readonly');
  PERFORM if_role_not_exists('readwrite', 'CREATE ROLE readwrite IN ROLE readonly');
  PERFORM if_role_not_exists('temporary_admin', 'CREATE ROLE temporary_admin IN ROLE readwrite');

  -- Create users
  PERFORM if_role_not_exists('mirror_graphql', 'CREATE USER mirror_graphql WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readonly');
  PERFORM if_role_not_exists('mirror_grpc', 'CREATE USER mirror_grpc WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readonly');
  PERFORM if_role_not_exists('mirror_importer', 'CREATE USER mirror_importer WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readwrite');
  PERFORM if_role_not_exists('mirror_rest', 'CREATE USER mirror_rest WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readonly');
  PERFORM if_role_not_exists('mirror_rest_java', 'CREATE USER mirror_rest_java WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readonly');
  PERFORM if_role_not_exists('mirror_rosetta', 'CREATE USER mirror_rosetta WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readonly');
  PERFORM if_role_not_exists('mirror_web3', 'CREATE USER mirror_web3 WITH LOGIN PASSWORD ''XXXXXXXXXXXX'' IN ROLE readonly');

  -- Set statement timeouts
  ALTER USER mirror_graphql SET statement_timeout TO '10000';
  ALTER USER mirror_grpc SET statement_timeout TO '10000';
  ALTER USER mirror_rest SET statement_timeout TO '20000';
  ALTER USER mirror_rest_java SET statement_timeout TO '20000';
  ALTER USER mirror_rosetta SET statement_timeout TO '10000';
  ALTER USER mirror_web3 SET statement_timeout TO '10000';

  -- Grants
  GRANT temporary_admin TO postgres;
  GRANT temporary_admin TO mirror_importer;

  -- Create schema and permissions
  CREATE SCHEMA IF NOT EXISTS public AUTHORIZATION postgres;
  GRANT USAGE ON SCHEMA public TO public;
  REVOKE CREATE ON SCHEMA public FROM public;

  CREATE SCHEMA IF NOT EXISTS temporary AUTHORIZATION temporary_admin;
  GRANT USAGE ON SCHEMA temporary TO public;
  REVOKE CREATE ON SCHEMA temporary FROM public;

  -- Read-only privileges
  GRANT CONNECT ON DATABASE mirror_node TO readonly;
  GRANT SELECT ON ALL TABLES IN SCHEMA public, temporary TO readonly;
  GRANT USAGE ON SCHEMA public, temporary TO readonly;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public, temporary GRANT SELECT ON TABLES TO readonly;

  -- Read-write privileges
  GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO readwrite;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO readwrite;

  -- Extensions
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  ALTER TYPE timestamptz OWNER TO postgres;

END;
$$;
EOF
./init1.sh