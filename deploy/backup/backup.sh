#!/bin/sh
# Daily MySQL backup with 30-day retention (RNF11, issue #81).
#   backup.sh            → runs one backup now
#   backup.sh --daemon   → runs one backup per day at BACKUP_HOUR (UTC)
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_HOUR="${BACKUP_HOUR:-03}"

run_backup() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  file="/backups/atelier_bureau-${stamp}.sql.gz"
  echo "[backup] dumping to ${file}"
  mysqldump -h db -u atelier_backup -p"${MYSQL_BACKUP_PASSWORD}" \
    --single-transaction --routines --triggers --no-tablespaces \
    atelier_bureau | gzip > "${file}.tmp"
  mv "${file}.tmp" "${file}"
  find /backups -name 'atelier_bureau-*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete
  echo "[backup] done"
}

if [ "${1:-}" != "--daemon" ]; then
  run_backup
  exit 0
fi

last_day=""
while true; do
  day=$(date -u +%Y%m%d)
  hour=$(date -u +%H)
  if [ "${hour}" = "${BACKUP_HOUR}" ] && [ "${day}" != "${last_day}" ]; then
    run_backup || echo "[backup] failed"
    last_day="${day}"
  fi
  sleep 300
done
