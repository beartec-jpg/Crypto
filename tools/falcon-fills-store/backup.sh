#!/bin/bash
# Copyright (c) 2025-2026 BEARTEC (Scott Reynolds). All rights reserved.
set -euo pipefail
DB="${FALCON_FILLS_DB:-/var/lib/falcon-fills-store/fills.sqlite}"
BACKUP_DIR="${FALCON_FILLS_BACKUP_DIR:-/var/lib/falcon-fills-store/backups}"
KEEP="${FALCON_FILLS_BACKUP_KEEP:-7}"
mkdir -p "$BACKUP_DIR"
ts=$(date -u +%Y%m%dT%H%M%SZ)
dest="$BACKUP_DIR/fills-$ts.sqlite"
sqlite3 "$DB" ".backup '$dest'"
# retention: keep newest KEEP files only; never touch non-backup paths
ls -1t "$BACKUP_DIR"/fills-*.sqlite 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
# bound: warn if backups dir > 2G (do not delete unrelated data)
du_k=$(du -sk "$BACKUP_DIR" | awk '{print $1}')
if [ "$du_k" -gt 2097152 ]; then
  echo "backup_dir_large_kb=$du_k" >&2
fi
echo "backup_ok path=$dest"
