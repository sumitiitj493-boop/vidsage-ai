#!/bin/bash
# =============================================================
# VidSage — Backup Script
# Backs up ChromaDB, uploads, downloads, and env config
# Run via cron: 0 3 * * * /path/to/backup.sh
# =============================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/vidsage}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

echo "=== VidSage Backup — $(date) ==="

# Create backup directory
mkdir -p "${BACKUP_PATH}"

# 1. Backup ChromaDB vector store
echo "📦 Backing up ChromaDB..."
docker compose exec -T backend tar czf - /app/chroma_db > "${BACKUP_PATH}/chroma_db.tar.gz" 2>/dev/null || {
    echo "⚠️  ChromaDB backup failed (container may not be running)"
}

# 2. Backup uploads
echo "📦 Backing up uploads..."
docker compose exec -T backend tar czf - /app/app/uploads > "${BACKUP_PATH}/uploads.tar.gz" 2>/dev/null || {
    echo "⚠️  Uploads backup failed"
}

# 3. Backup downloads
echo "📦 Backing up downloads..."
docker compose exec -T backend tar czf - /app/app/downloads > "${BACKUP_PATH}/downloads.tar.gz" 2>/dev/null || {
    echo "⚠️  Downloads backup failed"
}

# 4. Backup environment config
echo "📦 Backing up env config..."
if [ -f "backend/.env" ]; then
    cp "backend/.env" "${BACKUP_PATH}/.env.backup"
    chmod 600 "${BACKUP_PATH}/.env.backup"
fi

# 5. Backup Redis dump (if available)
echo "📦 Backing up Redis..."
docker compose exec -T redis redis-cli BGSAVE 2>/dev/null && sleep 2 || true
docker compose exec -T redis cat /data/dump.rdb > "${BACKUP_PATH}/redis_dump.rdb" 2>/dev/null || {
    echo "⚠️  Redis backup failed"
}

# Create summary
echo "📦 Creating backup manifest..."
cat > "${BACKUP_PATH}/manifest.json" << EOF
{
    "timestamp": "${TIMESTAMP}",
    "date": "$(date -Iseconds)",
    "components": {
        "chroma_db": true,
        "uploads": true,
        "downloads": true,
        "redis": true,
        "env_config": true
    },
    "size_bytes": $(du -sb "${BACKUP_PATH}" | cut -f1)
}
EOF

# Compress entire backup
echo "📦 Compressing backup..."
tar czf "${BACKUP_PATH}.tar.gz" -C "${BACKUP_DIR}" "${TIMESTAMP}"
rm -rf "${BACKUP_PATH}"

# Cleanup old backups
echo "🗑️  Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "*.tar.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

BACKUP_SIZE=$(du -sh "${BACKUP_PATH}.tar.gz" | cut -f1)
echo "✅ Backup complete: ${BACKUP_PATH}.tar.gz (${BACKUP_SIZE})"
echo "=== Done ==="