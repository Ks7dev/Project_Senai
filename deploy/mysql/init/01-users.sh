#!/bin/bash
# Creates the database users on the first start of the db container
# (ARCHITECTURE.md 5.1). Runs once, when the mysql-data volume is empty.
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
-- Every user requires TLS (RNF16, #221). The host is '%' because the
-- app reaches MySQL from the Docker network, whose subnet is not fixed.
-- App user: data only, no DDL.
CREATE USER IF NOT EXISTS 'atelier_app'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON atelier_bureau.* TO 'atelier_app'@'%';

-- Migration user: DDL on the app schema, used by prisma migrate deploy.
CREATE USER IF NOT EXISTS 'atelier_migrate'@'%' IDENTIFIED BY '${MYSQL_MIGRATE_PASSWORD}' REQUIRE SSL;
GRANT ALL PRIVILEGES ON atelier_bureau.* TO 'atelier_migrate'@'%';
-- Shadow database for `prisma migrate dev` (development only): the
-- migration user cannot create databases, so it gets a fixed one.
CREATE DATABASE IF NOT EXISTS atelier_bureau_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON atelier_bureau_shadow.* TO 'atelier_migrate'@'%';

-- Backup user: read-only dump.
CREATE USER IF NOT EXISTS 'atelier_backup'@'%' IDENTIFIED BY '${MYSQL_BACKUP_PASSWORD}' REQUIRE SSL;
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT ON atelier_bureau.* TO 'atelier_backup'@'%';
GRANT PROCESS ON *.* TO 'atelier_backup'@'%';
SQL

# Developer access from other LAN devices: named user, restricted to
# the subnet and with TLS required. Skipped when no password is set.
if [ -n "${MYSQL_DEV_PASSWORD:-}" ]; then
  mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS 'dev'@'${LAN_SUBNET}' IDENTIFIED BY '${MYSQL_DEV_PASSWORD}' REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON atelier_bureau.* TO 'dev'@'${LAN_SUBNET}';
SQL
fi

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;"
