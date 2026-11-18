#!/bin/sh
# Runs inside the `db` container, called by restore.sh / restore.ps1
# (RNF11, issue #81). Never run it by hand on the host.
#   restore-in-container.sh check    → validates /tmp/restore.sql.gz
#   restore-in-container.sh restore  → recreates TARGET_DB and imports it
#   restore-in-container.sh summary  → prints the restored tables
# TARGET_DB comes from `docker compose exec -e`; root logs in through
# the socket with the container's own MYSQL_ROOT_PASSWORD, so the
# password never leaves the container.
set -eu

DUMP="/tmp/restore.sql.gz"
export MYSQL_PWD="${MYSQL_ROOT_PASSWORD}"

case "${TARGET_DB:-}" in
  "" | *[!A-Za-z0-9_]*)
    echo "[restore] invalid target database name" >&2
    exit 2
    ;;
  mysql | sys | information_schema | performance_schema)
    echo "[restore] refusing to overwrite a system schema" >&2
    exit 2
    ;;
esac

case "${1:-}" in
  check)
    gzip -t "${DUMP}" || {
      echo "[restore] the file is not a valid gzip" >&2
      exit 3
    }
    # mysqldump writes this closing line only when the dump completed
    if ! gzip -dc "${DUMP}" | tail -n 1 | grep -q "Dump completed"; then
      echo "[restore] incomplete dump (no 'Dump completed' line)" >&2
      exit 3
    fi
    echo "[restore] dump is valid"
    ;;
  restore)
    mysql -uroot -e "DROP DATABASE IF EXISTS \`${TARGET_DB}\`;
      CREATE DATABASE \`${TARGET_DB}\`
        CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
    gzip -dc "${DUMP}" | mysql -uroot "${TARGET_DB}"
    rm -f "${DUMP}"
    echo "[restore] import finished"
    ;;
  summary)
    mysql -uroot -N -e "SELECT CONCAT('tables: ', COUNT(*))
      FROM information_schema.tables WHERE table_schema = '${TARGET_DB}';"
    mysql -uroot -N -e "SELECT CONCAT('triggers: ', COUNT(*))
      FROM information_schema.triggers WHERE trigger_schema = '${TARGET_DB}';"
    mysql -uroot -N -e "SELECT CONCAT('last migration: ', migration_name)
      FROM \`${TARGET_DB}\`._prisma_migrations
      ORDER BY finished_at DESC LIMIT 1;" || true
    ;;
  *)
    echo "usage: restore-in-container.sh check|restore|summary" >&2
    exit 2
    ;;
esac
