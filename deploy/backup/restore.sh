#!/bin/sh
# Restores a dump from ./backups into a MySQL database of the local
# server (RNF11, issue #81). Run on the server machine, from any folder,
# with `docker compose up -d` running. Step by step and RTO in
# docs/AtelierBureau_Backup_Restauracao.md.
#
#   sh deploy/backup/restore.sh                       → lists the dumps
#   sh deploy/backup/restore.sh latest                → newest dump
#   sh deploy/backup/restore.sh backups/<file>.sql.gz → that dump
#
# Options:
#   --target <db>         database to restore into (default atelier_bureau);
#                         use atelier_bureau_restore_test for a drill
#   --yes                 skips the confirmation (scripts only)
#   --no-safety-backup    skips the dump of the current data taken before
#                         overwriting atelier_bureau
#
# Restoring into atelier_bureau stops the app, drops and recreates the
# database, imports the dump and starts the app again, which then runs
# `prisma migrate deploy` for any migration newer than the dump.
set -eu

cd "$(dirname "$0")/../.."

TARGET="atelier_bureau"
ASSUME_YES=""
SAFETY_BACKUP="1"
FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      [ $# -ge 2 ] || { echo "--target needs a database name" >&2; exit 2; }
      TARGET="$2"
      shift 2
      ;;
    --yes) ASSUME_YES="1"; shift ;;
    --no-safety-backup) SAFETY_BACKUP=""; shift ;;
    -h | --help) sed -n '2,20p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) FILE="$1"; shift ;;
  esac
done

case "${TARGET}" in
  "" | *[!A-Za-z0-9_]*)
    echo "invalid database name: ${TARGET}" >&2
    exit 2
    ;;
esac

if [ -z "${FILE}" ]; then
  echo "Available dumps (oldest first):"
  ls -1 backups/atelier_bureau-*.sql.gz 2> /dev/null || echo "  none in ./backups"
  echo "Usage: sh deploy/backup/restore.sh [--target <db>] latest|<file>"
  exit 2
fi

if [ "${FILE}" = "latest" ]; then
  FILE=$(ls -1 backups/atelier_bureau-*.sql.gz 2> /dev/null | tail -n 1)
  [ -n "${FILE}" ] || { echo "no dump in ./backups" >&2; exit 2; }
fi
[ -f "${FILE}" ] || { echo "file not found: ${FILE}" >&2; exit 2; }

echo "Dump:     ${FILE}"
echo "Target:   ${TARGET} (will be DROPPED and recreated)"
if [ "${TARGET}" = "atelier_bureau" ]; then
  echo "The app is stopped during the restore. Orders placed after this"
  echo "dump are lost unless they are in the safety dump."
fi

if [ -z "${ASSUME_YES}" ]; then
  printf "Type the target database name to confirm: "
  read -r answer
  if [ "${answer}" != "${TARGET}" ]; then
    echo "Cancelled: nothing was changed."
    exit 1
  fi
fi

started=$(date +%s)
APP_STOPPED=""

# Always brings the app back and removes the copy of the dump, even
# when a step fails.
cleanup() {
  docker compose exec -T db rm -f /tmp/restore.sql.gz \
    /tmp/restore-in-container.sh > /dev/null 2>&1 || true
  if [ -n "${APP_STOPPED}" ]; then
    echo "[restore] starting the app"
    docker compose start app || true
  fi
}
trap cleanup EXIT

in_db() {
  docker compose exec -T -e TARGET_DB="${TARGET}" db \
    sh /tmp/restore-in-container.sh "$1"
}

echo "[restore] copying the dump into the db container"
docker compose cp deploy/backup/restore-in-container.sh \
  db:/tmp/restore-in-container.sh
docker compose cp "${FILE}" db:/tmp/restore.sql.gz
in_db check

if [ "${TARGET}" = "atelier_bureau" ]; then
  if [ -n "${SAFETY_BACKUP}" ]; then
    echo "[restore] safety dump of the current data"
    docker compose exec -T backup sh /usr/local/bin/backup.sh
  fi
  echo "[restore] stopping the app"
  docker compose stop app
  APP_STOPPED="1"
fi

echo "[restore] importing into ${TARGET}"
in_db restore
in_db summary

finished=$(date +%s)
elapsed=$((finished - started))
echo "[restore] done in $((elapsed / 60)) min $((elapsed % 60)) s;" \
  "write it down in the restore log (RTO 4 h)"
