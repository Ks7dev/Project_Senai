#!/bin/sh
# Requires TLS from the users of a database created before #221 (RNF16).
# New databases get it from init/01-users.sh. Run on the server machine,
# in the project folder, after updating MIGRATION_DATABASE_URL (and
# SHADOW_DATABASE_URL, if used) in .env with ?sslaccept=accept_invalid_certs:
#
#   docker compose exec -T db sh < deploy/mysql/require-tls.sh
#   docker compose up -d db app backup
#
# It only changes the users; `require_secure_transport` comes from the
# flag in docker-compose.yml when the db container is recreated.
set -eu

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
ALTER USER IF EXISTS 'atelier_app'@'%' REQUIRE SSL;
ALTER USER IF EXISTS 'atelier_migrate'@'%' REQUIRE SSL;
ALTER USER IF EXISTS 'atelier_backup'@'%' REQUIRE SSL;
SELECT user, host, ssl_type FROM mysql.user WHERE user LIKE 'atelier%';
SQL
