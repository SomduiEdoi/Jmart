#!/usr/bin/env bash
set -euo pipefail

DB_FILE="${DATABASE_FILE:-/opt/jmart/data/jmart.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/opt/jmart/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/jmart-$timestamp.sqlite'"
find "$BACKUP_DIR" -type f -name "jmart-*.sqlite" -mtime +"$RETENTION_DAYS" -delete

echo "Backup created: $BACKUP_DIR/jmart-$timestamp.sqlite"
