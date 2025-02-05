create extension if not exists btree_gist;
create extension if not exists pg_trgm;
create extension if not exists pg_stat_statements;

create role readonly;
create role readwrite in role readonly;
create role temporary_admin in role readwrite;

grant temporary_admin to mirror_provisioner;

create schema if not exists temporary authorization temporary_admin;
grant usage on schema temporary to public;
revoke create on schema temporary from public;

grant usage on schema public to public;
revoke create on schema public from public;

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