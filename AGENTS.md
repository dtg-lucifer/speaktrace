# AGENTS.md — SpeakTrace System Architecture & Guide for AI Agents

> **Read this first** when working on the `speaktrace` workspace.
> This file provides an architectural overview of the whole project so agents don't have to waste tokens re-exploring the codebase in subsequent sessions.

---

## 1. Project Overview & Vision

**SpeakTrace** is an end-to-end SaaS platform for automated audio speech processing, speaker diarization, user-assisted speaker identification, emotion and punctuation tagging, custom formatted transcription exports (e.g. VTT, TXT, custom grammar templates), and RAG-based LLM conversational querying over transcripts.

### Key Capabilities
1. **Audio Upload & Storage**: Durable media upload via Cloudinary/S3 and PostgreSQL tracking.
2. **Audio Processing Pipeline**:
   - **Speaker Diarization**: Detect who spoke when using pyannote / WhisperX.
   - **Speaker Identification**: Interactive snippet-based speaker labeling UI.
   - **Speech-to-Text (ASR)**: Whisper transcription with timestamp alignment.
   - **Emotion & Punctuation**: Sentiment & punctuation enrichment.
   - **Post-processing Engine**: Export to `.vtt`, `.txt`, `.json`, and user-defined grammar templates (`[$PERSON] -> $SPEECH`).
3. **LLM + RAG System**: Vector embeddings of transcript chunks for semantic QA ("What was said at 02:15 about X?").
4. **SaaS Credit & Plan Infrastructure**:
   - Self-registration for users with default free credits (configured in `system_settings`).
   - Dynamic credit cost deduction based on audio length & processing features requested (transcription, diarization, emotion, RAG indexing).
   - Dynamic dynamic settings stored in PostgreSQL `system_settings` table.
   - Super Admin role for administrative control and settings management.

---

## 2. Directory & Component Structure

```
speaktrace/
├── AGENTS.md                  ← Main entry point for AI agent documentation (THIS FILE)
├── HLD.md                     ← High Level Design & technical architecture document
├── IDEA.md                    ← Functional requirements & product goal
├── WORKFLOW.md                ← Detailed technical implementation workflow & diagrams
├── api/                       ← Express + TypeScript backend API on Bun
│   ├── AGENTS.md              ← Sub-agents guide for API backend (see api/AGENTS.md)
│   ├── package.json           ← Scripts: dev, build, db:migrate, db:seed, typecheck
│   ├── config.yaml            ← System configuration & feature flags
│   ├── docker/                ← Docker Compose setup (Postgres, Redis, RabbitMQ, BullMQ)
│   ├── docs/                  ← TypeSpec / OpenAPI API documentation
│   └── src/
│       ├── config/            ← Environment variables & configuration manager
│       ├── lib/               ← Cloudinary, RabbitMQ, Event consumers, password hashing
│       ├── modules/           ← Feature modules (auth, users, uploads, system)
│       ├── scripts/           ← Seeding scripts (seed.ts) and OpenAPI generation
│       └── shared/            ← DB pool, base repository, event bus, middlewares
└── worker/                    ← Python FastAPI + LangChain Agent API
    ├── AGENTS.md              ← Sub-agents guide for Python worker (see worker/AGENTS.md)
    ├── main.py                ← Uvicorn entrypoint
    ├── pyproject.toml         ← Python project dependencies managed by uv
    └── app/
        ├── agent/             ← LangChain agent executor & tools
        ├── api/               ← FastAPI router & chat/memory endpoints
        ├── core/              ← Config, LLM factory (Gemini/OpenAI), Redis client, auth
        ├── prompts/           ← System prompts & context formatting
        └── services/          ← Backend client, context builder, chat history
```

---

## 3. Core Sub-Systems & Documentation Links

- **API Subsystem Documentation**: Link to [api/AGENTS.md](file:///home/piush/Prog/proj/speaktrace/api/AGENTS.md)
  - Details express server layout, node-pg-migrate DB migrations, `system_settings` table, credit ledger, auth endpoints, and job pipeline.
- **Worker Subsystem Documentation**: Link to [worker/AGENTS.md](file:///home/piush/Prog/proj/speaktrace/worker/AGENTS.md)
  - Details Python FastAPI agent, LangChain tools, Gemini 2.0 Flash integration, Redis rolling memory, and context builder.

---

## 4. SaaS Data Model & Database Schema

Full ERD & Schema documentation: [api/docs/PHASE2_SUMMARY.md](file:///home/piush/Prog/proj/speaktrace/api/docs/PHASE2_SUMMARY.md#%F0%9F%97%84%EF%B8%8F-database-schema--entity-relationships)

### Tables Overview (`api/src/shared/database/migrations`)
1. **`users`**: User identities, auth credentials, multi-tenancy `tenant_id`, role (`'admin'` | `'member'`), subscription `plan` (`'free'` | `'pro'` | `'enterprise'`), and balance `credits`.
2. **`system_settings`**: Global dynamic configuration table (`key PRIMARY KEY`, `value JSONB`, `description`, `updated_at`). Stores rate limits, feature costs, and default signup credits.
3. **`credit_transactions`**: Immutable ledger tracking every credit movement (`user_id`, `amount`, `balance_after`, `type`, `description`, `job_id`).
4. **`media_assets`**: File metadata storing upload references (`original_filename`, `mime_type`, `file_size_bytes`, `duration_seconds`, `storage_public_id`, `storage_url`, `status`).
5. **`processing_jobs`**: State machine tracking the audio processing lifecycle (`status`, `current_stage`, `progress_pct`, `options` JSONB, `correlation_id`).
6. **`tenants` & `projects`**: B2B multi-tenancy scoping tables.
7. **`audit_logs`**: System audit trail logging security actions, logins, registrations, and administrative updates.

## 5. Queue & Event Infrastructure (`QUEUE_PROVIDER`)

SpeakTrace supports **two dynamic Queue & Event Providers**, switchable via `QUEUE_PROVIDER` in `.env`:
1. **`bullmq` (Recommended - Redis Backend)**:
   - Uses Redis to manage job queues (`media.uploaded`, `media.validated`, `audio.extracted`, `job.progress.updated`, `notification_jobs`).
   - Removes the dependency on RabbitMQ. Highly recommended for simpler infrastructure setups.
2. **`rabbitmq` (AMQP Backend)**:
   - Uses RabbitMQ message exchanges and topic routes (`speak_trace`).
   - Useful for cross-service AMQP integrations with external polyglot consumers.

Switch anytime by setting:
```env
QUEUE_PROVIDER=bullmq   # or 'rabbitmq'
```

---

## 6. Development Setup & Commands

### Infrastructure (Docker)
```bash
cd api/docker
docker compose up -d
```
Runs PostgreSQL (port 5432), Redis (port 6379), RabbitMQ (port 5672, management UI 15672).

### API Server (`api/`)
```bash
cd api
bun install
bun run db:migrate    # Run database migrations
bun run db:seed       # Seed system settings, admin, normal & paid users
bun run dev           # Start API server on http://localhost:8989
```

### Worker Service (`worker/`)
```bash
cd worker
uv sync
uv run main.py        # Starts FastAPI agent server on http://localhost:8000
```

---

## 6. Rules & Conventions for Agents

1. **Check Existing Modules**: Always look into `api/src/modules/` before adding new HTTP endpoints.
2. **Database Integrity**: Put all raw SQL inside repository classes (`*.repository.ts`) or migration files. Never write inline SQL in HTTP controllers/services.
3. **Keep Environment Variables in Sync**: Always mirror new environment variables between `.env`, `.env.example`, `api/src/config/env.ts`, and `worker/app/core/config.py`.
4. **Credit Checks**: Any resource-heavy operation (upload, audio transcription, LLM RAG analysis) must check and deduct user credits via `SystemSettingsService` and log a `credit_transactions` entry.
