#!/bin/bash
# =============================================================
# VidSage — Restore Script
# Restores from a backup created by backup.sh
# Usage: ./restore.sh /backups/vidsage/20250527_030000.tar.gz
# =============================================================

set -euo pipefail

BACKUP_FILE="${1:?Usage: restore.sh <backup_file.tar.gz>}"
RESTORE_DIR="${RESTORE_DIR:-/tmp/vidsage-restore}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "❌ Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "⚠️  WARNING: This will replace current data!"
echo "   Backup file: ${BACKUP_FILE}"
read -p "   Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo "=== VidSage Restore — $(date) ==="

# Extract backup
mkdir -p "${RESTORE_DIR}"
echo "📦 Extracting backup..."
tar xzf "${BACKUP_FILE}" -C "${RESTORE_DIR}"

# Find the timestamp directory
BACKUP_DIR_NAME=$(ls "${RESTORE_DIR}" | head -1)
FULL_PATH="${RESTORE_DIR}/${BACKUP_DIR_NAME}"

# Stop services
echo "🛑 Stopping services..."
docker compose stop backend celery-worker

# 1. Restore ChromaDB
if [ -f "${FULL_PATH}/chroma_db.tar.gz" ]; then
    echo "📦 Restoring ChromaDB..."
    cat "${FULL_PATH}/chroma_db.tar.gz" | docker compose exec -T backend tar xzf - -C /
fi

# 2. Restore uploads
if [ -f "${FULL_PATH}/uploads.tar.gz" ]; then
    echo "📦 Restoring uploads..."
    cat "${FULL_PATH}/uploads.tar.gz" | docker compose exec -T backend tar xzf - -C /
fi

# 3. Restore downloads
if [ -f "${FULL_PATH}/downloads.tar.gz" ]; then
    echo "📦 Restoring downloads..."
    cat "${FULL_PATH}/downloads.tar.gz" | docker compose exec -T backend tar xzf - -C /
fi

# 4. Restore Redis
if [ -f "${FULL_PATH}/redis_dump.rdb" ]; then
    echo "📦 Restoring Redis..."
    docker compose stop redis
    cat "${FULL_PATH}/redis_dump.rdb" | docker compose exec -T redis sh -c 'cat > /data/dump.rdb'
fi

# 5. Restore env config (manual)
if [ -f "${FULL_PATH}/.env.backup" ]; then
    echo "📋 Env config available at: ${FULL_PATH}/.env.backup"
    echo "   Copy manually if needed: cp ${FULL_PATH}/.env.backup backend/.env"
fi

# Start services
echo "🚀 Starting services..."
docker compose start redis
sleep 3
docker compose start backend celery-worker

# Cleanup
rm -rf "${RESTORE_DIR}"

echo "✅ Restore complete!"
echo "=== Done ==="