-- Run with psql as a PostgreSQL administrator. This is a local-development
-- bootstrap only; replace the example password before any shared deployment.
-- CREATE DATABASE cannot run inside a DO block, so psql's \gexec is used to
-- execute only the statements that are still needed.
\set rainwood_password 'change_me'
SELECT format('CREATE ROLE rainwood_user LOGIN PASSWORD %L', :'rainwood_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rainwood_user')\gexec
SELECT 'CREATE DATABASE rainwood_db OWNER rainwood_user ENCODING ''UTF8'''
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'rainwood_db')\gexec
GRANT CONNECT ON DATABASE rainwood_db TO rainwood_user;
