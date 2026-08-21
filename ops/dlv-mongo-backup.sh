#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/var/www/estampadosdlv}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL_FILE="$BACKUP_DIR/mongo-$STAMP.gz"
TMP_FILE="$BACKUP_DIR/.mongo-$STAMP.gz.tmp"

if [[ ! -r "$ENV_FILE" ]]; then
  echo "[dlv-mongo-backup] no se puede leer el archivo de entorno: $ENV_FILE" >&2
  exit 1
fi

MONGO_URL="$(awk -F= '$1 == "MONGO_URL" { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
if [[ -z "$MONGO_URL" ]]; then
  echo "[dlv-mongo-backup] MONGO_URL no está configurado" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
trap 'rm -f "$TMP_FILE"' EXIT

mongodump --uri="$MONGO_URL" --archive="$TMP_FILE" --gzip --quiet
gzip -t "$TMP_FILE"
chmod 600 "$TMP_FILE"
mv -f "$TMP_FILE" "$FINAL_FILE"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'mongo-*.gz' -mtime +"$RETENTION_DAYS" -delete

printf '[dlv-mongo-backup] backup=%s size=%s\n' "$(basename "$FINAL_FILE")" "$(stat -c '%s' "$FINAL_FILE")"
