dev:
	bun run dev

lint:
	bun run lint

lint-fix:
	bun run lint:fix --unsafe

typecheck:
	bun run typecheck

format:
	bun run format

db:
	sudo docker compose -f docker/docker-compose.yaml up redis postgres

worker:
	sudo docker compose -f docker/docker-compose.yaml up bullmq-worker

infra:
	sudo docker compose -f docker/docker-compose.yaml up redis postgres rabbitmq

docs:
	bun run docs:build

help:
	@echo "Available targets:"
	@awk -F: '/^[a-zA-Z0-9][a-zA-Z0-9_-]*:/ {print "  " $$1}' Makefile
