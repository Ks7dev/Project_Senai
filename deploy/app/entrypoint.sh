#!/bin/sh
# Applies pending migrations with the migration user, then starts the
# app with the user that has no DDL permission (ARCHITECTURE.md 5.1).
set -e

echo "Applying database migrations..."
(cd ./migrate && node ./node_modules/prisma/build/index.js migrate deploy)

# Cluster of APP_WORKERS processes sharing port 3000 (#79, RNF02)
echo "Starting Atelier Bureau..."
exec node deploy/app/cluster.mjs
