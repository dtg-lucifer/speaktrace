# SpeakTrace API Backend Architecture & Workflow

This document details the architectural layout, design patterns, component relationships, and execution flows within the SpeakTrace API backend.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Folder Structure & Core Modules](#2-folder-structure--core-modules)
3. [Startup Sequence](#3-startup-sequence)
4. [Request Lifecycle](#4-request-lifecycle)
5. [Database & Repository Layer](#5-database--repository-layer)
6. [Domain Event Bus & Cross-Service Messaging](#6-domain-event-bus--cross-service-messaging)
7. [Queue Providers (BullMQ & RabbitMQ)](#7-queue-providers-bullmq--rabbitmq)
8. [Real-time Events (WebSockets via Socket.IO)](#8-real-time-events-websockets-via-socketio)
9. [Authentication, Password Security & JWT](#9-authentication-password-security--jwt)
10. [API Response Convention & Validation Middleware](#10-api-response-convention--validation-middleware)
11. [Structured Logging & Audit Logs](#11-structured-logging--audit-logs)
12. [End-to-End Application Workflow](#12-end-to-end-application-workflow)
13. [Roadmap: Future Implementation Phases](#13-roadmap-future-implementation-phases)

---

## 1. High-Level Architecture

The API backend acts as the gateway and coordinator of the SpeakTrace service, communicating with clients, storing state in PostgreSQL, scheduling background tasks using queues, and orchestrating cross-service events with a Python-based ML worker through RabbitMQ.

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                │
│               (HTTP REST / WebSockets)                          │
└────────────────────┬──────────────────┬─────────────────────────┘
                     │ HTTP             │ WS (Socket.IO)
                     ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Node HTTP Server (Bun)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Express App                          │   │
│  │  Middlewares: Helmet, CORS, Rate Limit, Morgan,          │   │
│  │  Request ID, DI Locals, JWT Auth, Audit logging          │   │
│  │                                                          │   │
│  │  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐    │   │
│  │  │   Health    │   │     Auth     │   │   Uploads   │    │   │
│  │  │  Endpoints  │   │  Endpoints   │   │  Endpoints  │    │   │
│  │  └─────────────┘   └──────┬───────┘   └─────────────┘    │   │
│  └────────────────────────── │ ─────────────────────────────┘   │
│                              │                                  │
│  ┌───────────────────────────▼────────────────────────────────┐ │
│  │                  Socket.IO Real-time Server                │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ├─► DB Queries (pg Pool)  ──► PostgreSQL
           ├─► DomainEventBus.emit() ──► Local Pub/Sub
           └─► RabbitMQ / Queue Provider ──► Cross-Service Exchange
```

---

## 2. Folder Structure & Core Modules

The directory structure separates global infrastructure from specific business modules:

```
api/src/
  ├─ config/                # Zod configuration schemas & config.yaml parser
  ├─ lib/                   # Integrations (RabbitMQ consumers, shutdown handlers)
  ├─ scripts/               # Utility scripts (e.g., openapi.yaml generation)
  ├─ workers/               # BullMQ worker process entrypoint
  ├─ shared/                # Core reusable structures
  │   ├─ database/          # pg Pool connection, BaseRepository, SQL migrations
  │   ├─ errors/            # Standardized API Error subclasses
  │   ├─ events/            # In-memory DomainEventBus
  │   ├─ logging/           # Structured Winston setup & debug method logging
  │   ├─ middlewares/       # JWT verification, Audit, Morgan, DI, Validation
  │   ├─ openapi/           # OpenAPI Registry initialization
  │   ├─ queue/             # Dynamic providers (BullMQ/RabbitMQ wrappers)
  │   ├─ realtime/          # Socket.IO connection & event handlers
  │   ├─ types/             # Shared TypeScript models and enums
  │   └─ utils/             # Async helpers and standardized API responses
  └─ modules/               # Feature-specific API slices
      ├─ auth/              # Registration, Login, and Session management
      ├─ health/            # Legacy health schemas
      ├─ system/            # Health, Readiness, and openapi.json routing
      ├─ uploads/           # Media upload, Cloudinary streams, Job tracking
      └─ users/             # User profile endpoints
```

---

## 3. Startup Sequence

When launching the backend via `src/index.ts`, initialization follows a strict order to ensure dependecies are resolved prior to listening:

```
src/index.ts
  │
  ├─ dotenv.config()                  # Load environment variables
  ├─ configManager (singleton)        # Parse config.yaml and validate schema
  ├─ new Server(cfg)                  # Construct HTTP & Socket.IO server shim
  │
  └─ server.setup()
       ├─ setupDatabase()             # Initialize pg.Pool & test connection
       ├─ setupRealtime()             # Start Socket.IO server at /ws (if enabled)
       ├─ setupEventHandlers()        # Wire local event bus to Socket.IO handlers
       ├─ setupMiddlewares()          # Bind global Express middleware stack
       ├─ setupRoutes()               # Mount modules (Auth, Uploads, System)
       └─ setupDocumentation()        # Generate OpenAPI spec & mount Scalar UI
  │
  └─ server.start()                   # Start listening on PORT
```

_Graceful Shutdown:_ Handles `SIGINT`/`SIGTERM` signals. Closes connections in reverse order:

1. Stops accepting new HTTP requests.
2. Closes all active Socket.IO connections.
3. Drains background queue worker threads.
4. Shuts down RabbitMQ channel connections.
5. Terminates the PostgreSQL connection pool.

---

## 4. Request Lifecycle

Every HTTP request traverses the Express middleware chain before hitting a controller route handler:

```
Incoming Request
      │
      ▼
  body-parser          # Parse incoming JSON and URL-encoded bodies
      │
      ▼
  helmet               # Inject HTTP security headers (CSP, frameguard, etc.)
      │
      ▼
  express-rate-limit   # Tenant/IP rate limiter based on config limits
      │
      ▼
  cors                 # Validate Request Origin against whitelist
      │
      ▼
  morgan (winston)     # Log HTTP route hits and status codes
      │
      ▼
  request-id           # Generate and assign X-Request-ID trace header
      │
      ▼
  dependency-injection # Inject db pool, eventBus, and Socket.IO (io) to res.locals
      │
      ▼
  audit_logger         # Attach listener to log actions on res "finish"
      │
      ▼
  validate(schema)     # Zod-validate query, body, and params shape
      │
      ▼
  authenticate         # Check JWT Bearer token and populate req.user (if protected)
      │
      ▼
  Route Controller     # Execute module business logic
      │
      ▼
  sendResponse()       # Return standard JSON payload including Request ID
```

---

## 5. Database & Repository Layer

The database layer isolates SQL queries from business logic. Feature-specific classes inherit from `BaseRepository` to ensure standard operations are typed.

- **BaseRepository** (`src/shared/database/repositories/base.repository.ts`): Implements generic transaction capabilities.
- **AuthRepository** (`src/modules/auth/auth.repository.ts`): Queries for user credential verification, insertions, and sessions.
- **UploadsRepository** (`src/modules/uploads/uploads.repository.ts`): Controls CRUD operations on `media_assets` and `processing_jobs`.
- **UserRepository** (`src/shared/database/repositories/users.repository.ts`): Manages search and retrieval of user records.

_Transactions:_ Handled by obtaining a dedicated client from the pool (`const client = await this.db.connect()`), executing `BEGIN`, performing queries, and resolving with `COMMIT` (or `ROLLBACK` on catch blocks).

_Migrations:_ Stored as SQL scripts in `src/shared/database/migrations/` and run using the `node-pg-migrate` package.

---

## 6. Domain Event Bus & Cross-Service Messaging

### Local Domain Event Bus

Implemented in `src/shared/events/eventBus.ts` wrapping Node's `EventEmitter`. Allows modules to publish occurrences without coupling them to side effects.

- **Type Safety:** The payload interface `DomainEventMap` enforces exact properties at compile-time.
- **Example:** `eventBus.emit("auth.user.registered", { userId, email })` triggers hooks to dispatch welcome emails or initialize default workspace metrics.

### Cross-Service RabbitMQ Exchange

- The RabbitMQ Provider (`src/shared/queue/providers/rabbitmq.provider.ts`) establishes an exchange bridge.
- Whenever specific events (like `media.uploaded`) are emitted, they are routed to the Python ML worker.
- **Consumers** (`src/lib/event-consumers.ts`) listen for incoming events published by the worker:
    - `media.validated` -> updates state to `MEDIA_VALIDATED`
    - `audio.extracted` -> updates state to `AUDIO_EXTRACTED`
    - Updates are persisted in the PostgreSQL database and broadcasted back to the local `DomainEventBus`.

---

## 7. Queue Providers (BullMQ & RabbitMQ)

The backend features an abstract `IQueueProvider` in `src/shared/queue/queue.ts` allowing swapping of message systems dynamically based on environment configuration (`env.QUEUE_PROVIDER`).

- **BullMqQueueProvider** (`src/shared/queue/providers/bullmq.provider.ts`): Uses BullMQ backed by Redis for local in-app task queuing (such as rendering exports or sending bulk notification hooks).
- **RabbitMqQueueProvider** (`src/shared/queue/providers/rabbitmq.provider.ts`): Implements AMQP messaging for decoupled cross-service tasks.

---

## 8. Real-time Events (WebSockets via Socket.IO)

Located in `src/shared/realtime/socket.ts`. Pushes updates dynamically to active client sessions.

- **Connection Setup:** Binds to the same HTTP server port, exposing a connection point at `/ws`.
- **Client Rooms:** Clients subscribe to live progress updates of a specific job by emitting `join:job` with the `jobId`.
- **Event Forwarding:** Whenever the local Event Bus fires `job.progress.updated`, the Socket.IO server publishes a payload to the matching `job:${jobId}` room:
    ```ts
    eventBus.on("job.progress.updated", (payload) => {
        io.to(`job:${payload.jobId}`).emit("job:progress", payload);
    });
    ```

---

## 9. Authentication, Password Security & JWT

SpeakTrace implements secure, stateless authentication using JSON Web Tokens (JWT).

- **JWT Tokens:** Generates short-lived access tokens (e.g., 15m) and long-lived refresh tokens (e.g., 30d).
- **Password Protection:** Utilizes Node's native `crypto.pbkdf2Sync` to hash passwords with a unique salt, using 120,000 iterations of PBKDF2-SHA512. Saved in the format `iterations:salt:derivedHash`.
- **Route Authorization:** Protected routes verify the authorization header Bearer token using `authenticate` middleware, storing identity claims in `req.user`.

---

## 10. API Response Convention & Validation Middleware

### API Response Convention

All controllers respond using helper utilities in `src/shared/utils/response.ts`. Response shapes are uniform:

- **Success:** `{ success: true, message: string, data: T, statusCode: number, requestId: string }`
- **Error:** `{ success: false, message: string, errors: FieldError[], statusCode: number, requestId: string }`

### Zod Validation Middleware

Located at `src/shared/middlewares/validation.middleware.ts`. Automatically validates incoming requests against defined Zod schemas:

- **Automatic Schema Detection:** Smart logic inspects whether the provided schema is nested (expects `{ body, query, params }`) or flat. If flat, it automatically maps the correct validation fields.
- **Standardized Field Errors:** If validation fails, the middleware returns a `400 Bad Request` containing an array of paths and validation messages.

---

## 11. Structured Logging & Audit Logs

### Structured Logging (Winston + Morgan)

- **Console Transport:** Color-coded, human-readable logging. Level set dynamically from configuration.
- **File Transports:** Stores full system output inside `logs/app.log` (all debug data) and errors in `logs/error.log`.
- **Morgan HTTP Logs:** Writes network requests to the `http` level stream.

### Audit Log Middleware

On execution finish of any authenticated request (except health paths), the audit middleware (`src/shared/middlewares/audit.middleware.ts`) logs the actor, action, timestamp, target entity, IP address, and client user-agent directly into the `audit_logs` table for compliance.

---

## 12. End-to-End Application Flow

The core media upload and diarization pipeline executes across services in the following steps:

```
[Client]                [API Gateway]            [RabbitMQ]            [Worker]
   │                          │                      │                    │
   │─ 1. POST /uploads ──────►│                      │                    │
   │   (multipart payload)    │                      │                    │
   │                          │─ 2. Stream to Cloud─►│                    │
   │                          │     inary storage    │                    │
   │                          │                      │                    │
   │                          │─ 3. Save DB entries ─│                    │
   │                          │   (assets & jobs)    │                    │
   │                          │                      │                    │
   │                          │─ 4. Publish Event ──►│                    │
   │                          │   ("media.uploaded") │                    │
   │   ◄─ 5. Return job.id ───│                      │                    │
   │                          │                      │                    │
   │                          │                      │─ 6. Consume ──────►│
   │                          │                      │  ("media.uploaded")│
   │                          │                      │                    │
   │                          │                      │◄─ 7. Publish ──────│
   │                          │                      │  ("media.validated")
   │                          │◄─ 8. Consume ────────│                    │
   │                          │   ("media.validated")│                    │
   │                          │                      │                    │
   │                          │─ 9. Update DB status │                    │
   │                          │   ("MEDIA_VALIDATED")│                    │
   │                          │                      │                    │
   │                          │─ 10. WS Broadcast ──►│                    │
   │                          │   (job:progress)     │                    │
   │                          │                      │                    │
   │                          │                      │◄─ 11. Publish ─────│
   │                          │                      │  ("audio.extracted")
   │                          │◄─ 12. Consume ───────│                    │
   │                          │   ("audio.extracted")│                    │
   │                          │                      │                    │
   │                          │─ 13. Update DB status│                    │
   │                          │   ("AUDIO_EXTRACTED")│                    │
   │                          │                      │                    │
   │                          │─ 14. WS Broadcast ──►│                    │
   │                          │   (job:progress)     │                    │
   │                          │                      │                    │
   │                          │                      │◄─ 15. Publish ─────│
   │                          │                      │  ("diarization.    │
   │                          │                      │    completed")     │
   │                          │◄─ 16. Consume ───────│                    │
   │                          │   ("diarization.     │                    │
   │                          │     completed")      │                    │
   │                          │                      │                    │
   │                          │─ 17. Pause pipeline  │                    │
   │                          │   (status enters     │                    │
   │                          │    "AWAITING_SPEAKER_│                    │
   │                          │     MAPPING")        │                    │
   │                          │                      │                    │
   │                          │─ 18. WS Broadcast ──►│                    │
   │                          │   ("speaker.mapping. │                    │
   │                          │     required")       │                    │
```

---

## 13. Roadmap: Future Implementation Phases

SpeakTrace will progress through the following subsequent feature phases to transition from the core API MVP to the full ML-driven platform:

### 🚀 Phase 2 — Speaker Workflow (Next Up)

Focuses on capturing speaker samples, identifying speakers, and allowing manual mapping via front-end UI.

- **Migration & Schema:** Create `speaker_profiles` table (`id`, `tenant_id`, `job_id`, `speaker_tag`, `label_name`, `sample_audio_url`, `created_at`).
- **Worker Tasks:**
    - Segment the audio during the diarization stage.
    - Crop speaker voice snippets (5-10 seconds) for unrecognized speakers.
    - Upload snippets to object storage and publish a `speaker.mapping.required` RabbitMQ event with URLs.
- **API Endpoints:**
    - `POST /uploads/jobs/:jobId/speaker-mapping` — Accept label configurations mapping `speaker_tag` to customized `label_name` strings.
    - Resume the job pipeline by publishing `speaker.mapping.submitted` back to RabbitMQ.
- **Frontend App (`www/`):**
    - Build a responsive labeling dashboard interface in Next.js.
    - Implement custom audio players allowing users to listen to samples and submit names.

### 🚀 Phase 3 — Enrichment & Exports

Transforms raw transcripts into formatted documents enriched with emotional and structural tags.

- **Migration & Schema:**
    - Create `transcript_segments` table (`id`, `job_id`, `speaker_id`, `start_time`, `end_time`, `text`, `emotion`, `confidence`).
    - Create `exports` table (`id`, `job_id`, `format` [vtt/txt/pdf/json], `storage_url`, `created_at`).
- **Worker Tasks:**
    - Emotion classification per segment.
    - Apply formatting models to refine punctuation.
    - Expose export builders generating VTT, SRT, TXT, or custom JSON.
- **API Endpoints:**
    - `POST /uploads/jobs/:jobId/exports` — Request export documents.
    - `GET /uploads/jobs/:jobId/transcript` — Retrieve full timestamp-aware transcript dataset.

### 🚀 Phase 4 — RAG Q&A (Search & Chat)

Provides conversational features allowing users to prompt questions directly against one or multiple transcripts.

- **Migration & Schema:**
    - Enable `pgvector` extension in PostgreSQL.
    - Create `rag_documents` table for storing text chunks and vector embeddings.
    - Create `chat_sessions` and `chat_messages` tables to track context history.
- **Worker Tasks:**
    - Chunk transcript text segments.
    - Generate embeddings using models (e.g., SentenceTransformers / OpenAI).
    - Store text chunks + embeddings in PostgreSQL.
    - Query LLM with injected context retrieval (RAG).
- **API Endpoints:**
    - `POST /uploads/jobs/:jobId/chat` — Start/continue conversations with context from a specific transcript.
    - Supports SSE (Server-Sent Events) streaming from the worker back to the client.

### 🚀 Phase 5 — Hardening, Scale & Operations

Secures the platform, enforces tenant boundaries, and scales processing.

- **Admin Dashboard:** Endpoints `GET /admin/jobs` with filtering by status, plus controls to manually pause, abort, or retry jobs.
- **Tenant Isolation:** Enforce row-level security (RLS) on PostgreSQL queries to prevent cross-tenant data leaks.
- **SLA Worker Guard:** Add cron-like BullMQ jobs to detect jobs stuck in active state machines and mark them as failed/timeout.
- **Distributed Tracing:** Add OpenTelemetry tracing context propagation from Gateway -> API Server -> RabbitMQ -> ML Worker.
