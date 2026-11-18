#!/bin/sh
# Runs a Node task of the repository on the VPS (docs/AtelierBureau_Deploy_VPS.md):
# the seed and the seed account rotation (#179). The app image has no
# tsx, and the VPS has no Node, so the task runs in a temporary
# node:24-alpine container on the Compose network, where MySQL is `db`.
#
#   sh deploy/vps/node-task.sh npm run db:seed
#   sh deploy/vps/node-task.sh npm run accounts:rotate-seed -- --dry-run
#   sh deploy/vps/node-task.sh npm run accounts:rotate-seed
#
# The other settings (SEED_PASSWORD, DATA_ENCRYPTION_KEY, DATABASE_TLS)
# come from .env, read by the scripts themselves; the two database URLs
# below take precedence over the localhost ones of the file. They go to
# the container in a temporary file (mode 600) mounted read-only and
# sourced inside it, never as `-e` arguments, so the passwords stay out
# of the host process list and of `docker inspect`.
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

: "${MYSQL_APP_PASSWORD:?set MYSQL_APP_PASSWORD in .env}"
: "${MYSQL_MIGRATE_PASSWORD:?set MYSQL_MIGRATE_PASSWORD in .env}"

# The seed falls back to the public development password when
# SEED_PASSWORD is empty (prisma/seed.ts): on an internet-facing host that
# would leave admin accounts with a known password, so refuse it here.
case " $* " in
  *db:seed* | *" db seed "* | *seed.ts*)
    : "${SEED_PASSWORD:?set SEED_PASSWORD in .env before seeding on the VPS}"
    if [ "$SEED_PASSWORD" = "atelier-demo-2026" ]; then
      echo "SEED_PASSWORD is the public development password" >&2
      exit 1
    fi
    if [ "${#SEED_PASSWORD}" -lt 16 ]; then
      echo "SEED_PASSWORD needs 16+ characters (openssl rand -hex 24)" >&2
      exit 1
    fi
    ;;
esac

tty_flag=""
if [ -t 0 ] && [ -t 1 ]; then
  tty_flag="-t"
fi

env_file=$(umask 077 && mktemp)
trap 'rm -f "$env_file"' EXIT INT TERM
# The Prisma CLI only negotiates TLS with sslaccept, and MySQL refuses TCP
# connections without TLS (--require-secure-transport=ON, #221)
{
  echo "DATABASE_URL=mysql://atelier_app:${MYSQL_APP_PASSWORD}@db:3306/atelier_bureau"
  echo "MIGRATION_DATABASE_URL=mysql://atelier_migrate:${MYSQL_MIGRATE_PASSWORD}@db:3306/atelier_bureau?sslaccept=accept_invalid_certs"
} > "$env_file"

# Source copied without backups, uploads, dependencies and Git history
docker run --rm -i ${tty_flag} \
  --network atelier-bureau_default \
  -v "$env_file":/run/task.env:ro \
  -v "$(pwd)":/src:ro \
  node:24-alpine sh -c '
    set -e
    set -a
    . /run/task.env
    set +a
    mkdir /work
    tar -C /src --exclude=./backups --exclude=./storage \
      --exclude=./node_modules --exclude=./.git --exclude=./.next -cf - . \
      | tar -C /work -xf -
    cd /work
    echo "Installing dependencies..."
    npm ci --no-audit --no-fund --loglevel=error > /dev/null
    exec "$@"
  ' sh "$@"
