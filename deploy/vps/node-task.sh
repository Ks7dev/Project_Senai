#!/bin/sh
# Runs a Node task of the repository on the VPS (docs/AtelierBureau_Deploy_VPS.md):
# the seed and the seed account rotation (#179). The app image has no
# tsx, and the VPS has no Node, so the task runs in a temporary
# node:24-alpine container on the Compose network, where MySQL is `db`.
#
#   sh deploy/vps/node-task.sh npm run db:seed
#   sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --dry-run
#
# The other settings (SEED_PASSWORD, DATA_ENCRYPTION_KEY, DATABASE_TLS)
# come from .env, read by the scripts themselves; the two database URLs
# below take precedence over the localhost ones of the file.
set -eu

cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
  echo ".env not found in $(pwd)" >&2
  exit 1
fi
if [ "$#" -eq 0 ]; then
  echo "usage: sh deploy/vps/node-task.sh <command> [args...]" >&2
  exit 1
fi

set -a
. ./.env
set +a

tty_flag=""
if [ -t 0 ] && [ -t 1 ]; then
  tty_flag="-t"
fi

# Source copied without backups, uploads, dependencies and Git history
docker run --rm -i ${tty_flag} \
  --network atelier-bureau_default \
  -v "$(pwd)":/src:ro \
  -e DATABASE_URL="mysql://atelier_app:${MYSQL_APP_PASSWORD}@db:3306/atelier_bureau" \
  -e MIGRATION_DATABASE_URL="mysql://atelier_migrate:${MYSQL_MIGRATE_PASSWORD}@db:3306/atelier_bureau" \
  node:24-alpine sh -c '
    set -e
    mkdir /work
    tar -C /src --exclude=./backups --exclude=./storage \
      --exclude=./node_modules --exclude=./.git --exclude=./.next -cf - . \
      | tar -C /work -xf -
    cd /work
    echo "Installing dependencies..."
    npm ci --no-audit --no-fund --loglevel=error > /dev/null
    exec "$@"
  ' sh "$@"
