#!/bin/sh
# Applies pending migrations with the migration user, then starts the
# app with the user that has no DDL permission (ARCHITECTURE.md 5.1).
set -e

echo "Applying database migrations..."
(cd ./migrate && node ./node_modules/prisma/build/index.js migrate deploy)

# The server never needs these secrets at runtime: drop them so a code
# execution or a /proc/self/environ read in the app cannot reach the DDL
# user, MySQL root, backup, tunnel or seed credentials (SEC-003, #220).
unset MIGRATION_DATABASE_URL SHADOW_DATABASE_URL \
  MYSQL_ROOT_PASSWORD MYSQL_APP_PASSWORD MYSQL_MIGRATE_PASSWORD \
  MYSQL_BACKUP_PASSWORD MYSQL_DEV_PASSWORD \
  CLOUDFLARE_TUNNEL_TOKEN SEED_PASSWORD

echo "Starting Atelier Bureau..."
exec node server.js
