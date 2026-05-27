# =============================================================
# VidSage — Makefile for Common Operations
# =============================================================

.PHONY: help up down restart logs build clean backup restore secrets test lint

# ── Default ────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Development ────────────────────────────────────────
up: ## Start all services
	docker compose up -d --build

down: ## Stop all services
	docker compose down

restart: ## Restart all services
	docker compose restart

build: ## Rebuild images (no cache)
	docker compose build --no-cache

logs: ## Tail logs for all services
	docker compose logs -f --tail=100

logs-backend: ## Tail backend logs
	docker compose logs -f --tail=100 backend

logs-celery: ## Tail celery worker logs
	docker compose logs -f --tail=100 celery-worker

logs-frontend: ## Tail frontend logs
	docker compose logs -f --tail=100 frontend

# ── Scaling ────────────────────────────────────────────
scale-workers: ## Scale celery workers (usage: make scale-workers N=3)
	docker compose up -d --scale celery-worker=${N:-2}

# ── Database ───────────────────────────────────────────
psql: ## Shell into backend container
	docker compose exec backend bash

redis-cli: ## Open Redis CLI
	docker compose exec redis redis-cli

# ── Backup & Restore ──────────────────────────────────
backup: ## Create backup
	bash scripts/backup.sh

restore: ## Restore from backup (usage: make restore FILE=/backups/vidsage/xxx.tar.gz)
	bash scripts/restore.sh ${FILE}

# ── Secrets ────────────────────────────────────────────
secrets: ## Generate production secrets
	python generate_secrets.py

# ── Monitoring ─────────────────────────────────────────
monitoring: ## Start monitoring stack (Prometheus + Grafana)
	docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml up -d

monitoring-down: ## Stop monitoring stack
	docker compose -f docker-compose.yml -f monitoring/docker-compose.monitoring.yml down

# ── Health Checks ──────────────────────────────────────
health: ## Check service health
	@echo "Backend:"
	@curl -s http://localhost/api/health | python3 -m json.tool 2>/dev/null || echo "  ❌ Backend unreachable"
	@echo "\nDetailed:"
	@curl -s http://localhost/api/health/detailed | python3 -m json.tool 2>/dev/null || echo "  ❌ Detailed health unreachable"

# ── Testing & Linting ─────────────────────────────────
test: ## Run backend tests
	cd backend && python -m pytest tests/ -v

lint: ## Lint backend code
	cd backend && pip install ruff -q && ruff check app/ --ignore=E501

# ── Cleanup ────────────────────────────────────────────
clean: ## Remove all containers, volumes, and images
	docker compose down -v --rmi local
	@echo "✅ Cleaned up everything"

# ── Full Reset ─────────────────────────────────────────
reset: clean secrets ## Full reset: clean + generate new secrets
	@echo "✅ Reset complete. Run 'make up' to start fresh."