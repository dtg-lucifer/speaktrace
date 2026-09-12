.PHONY: help infra-up infra-down infra-logs db-migrate db-seed dev-api dev-ml dev-dashboard report

help:
	@echo "SpeakTrace Orchestration Commands:"
	@echo "  make infra-up      - Start Postgres, Redis, RabbitMQ, Ollama, Prometheus, Loki, Grafana"
	@echo "  make infra-down    - Stop and remove all infrastructure containers"
	@echo "  make infra-logs    - Follow infrastructure container logs"
	@echo "  make db-migrate    - Run database migrations"
	@echo "  make db-seed       - Seed system settings and test users (including test@speaktrace.com with 10,000 tokens)"
	@echo "  make dev-api       - Run the API backend (Bun + Express)"
	@echo "  make dev-ml        - Run the ML processing & RAG worker (FastAPI + PyTorch)"
	@echo "  make dev-dashboard - Run the Next.js frontend dashboard"

infra-up:
	sudo docker compose up -d

infra-down:
	sudo docker compose down

infra-logs:
	sudo docker compose logs -f || sudo docker compose logs -f

db-migrate:
	cd api && bun run db:migrate

db-seed:
	cd api && bun run db:seed

dev-api:
	cd api && bun run dev

dev-ml:
	cd ml && uv run python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

dev-dashboard:
	cd dashboard && bun run dev

report:
	typst compile --font-path report/fonts report/main.typ report/REPORT.pdf
	mv report/REPORT.pdf .
	@echo "SpeakTrace technical report compiled to REPORT.pdf"
