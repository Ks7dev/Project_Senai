#!/bin/sh
# Applies pending migrations with the migration user, then starts the
# app with the user that has no DDL permission (ARCHITECTURE.md 5.1).
set -e

echo "Applying database migrations..."
(cd ./migrate && node ./node_modules/prisma/build/index.js migrate deploy)

echo "Starting Atelier Bureau..."
exec node server.js
