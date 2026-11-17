#!/bin/sh
# Daily MySQL backup with 30-day retention (RNF11, issue #81).
#   backup.sh            → runs one backup now
#   backup.sh --daemon   → runs one backup per day at BACKUP_HOUR (UTC)
#   backup.sh --health   → container healthcheck (#80): the daemon loop
#                          is alive and the last backup did not fail
set -eu

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_HOUR="${BACKUP_HOUR:-03}"
# Optional Uptime Kuma push monitor, called after each successful backup
# (#80). Missing push = alert. Empty disables it.
BACKUP_PUSH_URL="${BACKUP_PUSH_URL:-}"
HEARTBEAT_FILE="/tmp/backup-heartbeat"
FAILED_FILE="/tmp/backup-failed"

run_backup() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  file="/backups/atelier_bureau-${stamp}.sql.gz"
  echo "[backup] dumping to ${file}"
  mysqldump -h db -u atelier_backup -p"${MYSQL_BACKUP_PASSWORD}" \
    --single-transaction --routines --triggers --no-tablespaces \
    atelier_bureau | gzip > "${file}.tmp"
  # A pipeline returns the status of gzip, so a failed mysqldump is
  # caught by its closing line, written only when the dump completes.
  if ! gzip -dc "${file}.tmp" | tail -n 1 | grep -q "Dump completed"; then
    rm -f "${file}.tmp"
    echo "[backup] incomplete dump discarded"
    return 1
  fi
  mv "${file}.tmp" "${file}" || return 1
  find /backups -name 'atelier_bureau-*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete
  echo "[backup] done"
}

# Tells the uptime monitor that today's backup succeeded. A failure here
# only logs: the backup itself is already on disk.
notify_monitor() {
  if [ -z "${BACKUP_PUSH_URL}" ]; then
    return 0
  fi
  if command -v curl > /dev/null 2>&1; then
    curl -fsS -m 10 -o /dev/null "${BACKUP_PUSH_URL}" \
      || echo "[backup] monitor push failed"
  else
    echo "[backup] curl not found, monitor push skipped"
  fi
}

if [ "${1:-}" = "--health" ]; then
  [ ! -e "${FAILED_FILE}" ] || exit 1
  [ -n "$(find "${HEARTBEAT_FILE}" -mmin -10 2> /dev/null)" ] || exit 1
  exit 0
fi

if [ "${1:-}" != "--daemon" ]; then
  run_backup || exit 1
  exit 0
fi

last_day=""
while true; do
  touch "${HEARTBEAT_FILE}"
  day=$(date -u +%Y%m%d)
  hour=$(date -u +%H)
  if [ "${hour}" = "${BACKUP_HOUR}" ] && [ "${day}" != "${last_day}" ]; then
    # `set -e` is off inside a condition: run_backup returns 1 itself
    # when the dump is incomplete, so a failed dump never counts.
    if run_backup; then
      rm -f "${FAILED_FILE}"
      notify_monitor
    else
      echo "[backup] failed"
      touch "${FAILED_FILE}"
    fi
    last_day="${day}"
  fi
  sleep 300
done
