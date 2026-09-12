# SpeakTrace

A Human-in-the-Loop Audio Intelligence, Speaker Diarization, and Conversational Transcript Workspace.

---

## Overview

High-stakes conversations are still transcribed manually across industries where accuracy is paramount: courtroom proceedings, judicial depositions, police interrogations, investigative interviews, legislative hearings, and executive board meetings. Professionals in these domains spend hours listening through raw audio recordings, isolating who spoke at every turn, manually typing out dialogue, resolving cross-talk, and structuring output into certified legal or compliance records.

Pure automated speech recognition (ASR) tools have reduced word error rates, but they introduce new friction:
* Diarization models output anonymous speaker clusters (`SPEAKER_00`, `SPEAKER_01`), requiring practitioners to scrub through hours of audio just to figure out who is who.
* Output formats are rigid, often confined to standard subtitles rather than formal record-keeping templates.
* Transcripts remain static text files that cannot be queried or cross-examined efficiently.

**SpeakTrace** is built to bridge this gap. Rather than attempting to remove the human from high-stakes workflows, SpeakTrace provides an end-to-end human-in-the-loop pipeline:

```
Automate Repetitive Transcription -> Human Verification & Editing -> Queryable Record
```

The system automatically performs voice activity detection, speaker diarization, and isolated vocal snippet extraction. It provides reviewers with an interactive workspace to audition single-speaker audio snippets, map identities once, edit synchronized transcripts, export custom-formatted documents, and interrogate the conversation via local retrieval-augmented generation (RAG).

---

## Target Industries and Use Cases

SpeakTrace is designed for technical and domain specialists in legal technology, public safety, compliance, journalism, and AI automation:

### Courtroom Proceedings and Judicial Depositions
Court reporters, typists, and legal clerks can avoid starting from a blank document. SpeakTrace pre-generates a speaker-separated draft aligned with timestamps, enabling the reporter to focus on verification, terminology accuracy, and official certification.

### Police Interrogations and Public Safety Investigations
Investigators and detectives processing multi-hour recorded interviews receive a searchable, speaker-indexed transcript. High-confidence voice snippets allow rapid labeling of suspects, witnesses, and interrogators without listening to the entire recording.

### Corporate Hearings, Board Meetings, and Compliance
Compliance officers and executive assistants can organize multi-party discussions, record action items with verified speaker attribution, and export formatted minutes matching internal governance standards.

### Investigative Journalism and Academic Research
Researchers and journalists working through hundreds of hours of source interviews can search across recordings, isolate key witness quotes with exact time markers, and query statements across transcripts.

---

## Key Capabilities

### 1. Speaker Diarization and Voice Snippet Isolation
* Automatic multi-speaker separation using deep acoustic embeddings.
* Dynamic voice slicing that isolates clean 1.5-second to 5-second single-speaker speech segments per detected acoustic cluster.
* Audio snippets hosted via durable cloud storage for instant web playback.

### 2. Interactive Human-in-the-Loop Identification
* Web interface presenting playable audio cards for each detected speaker cluster.
* Single-click playback allows reviewers to hear the speaker's voice in isolation and map cluster IDs (e.g., `SPEAKER_00`) to real names (e.g., `Detective Miller`, `Witness A`).
* Renaming propagates instantly across the entire timeline and downstream exports.

### 3. Timestamp-Aligned Speech-to-Text
* Precision transcription powered by OpenAI Whisper models.
* Word- and segment-level timestamps linked directly to the waveform and player.
* Non-destructive web editor allowing rapid correction of misheard technical or legal terms.

### 4. Custom Grammar Templates and Multi-Format Export
* Standard subtitle exports including WebVTT (`.vtt`), JSON, and plain text (`.txt`).
* User-defined grammar templates supporting domain-specific syntax:
  ```text
  [$PERSON] -> $SPEECH
  ```
  or formal court reporter deposition schemas:
  ```text
  Q. [Questioner]: [Speech]
  A. [Respondent]: [Speech]
  ```

### 5. Project-Scoped Conversational RAG
* Transcripts are partitioned into structured vector chunks (110-200 token ratio) and embedded into ChromaDB with `all-MiniLM-L6-v2`.
* Integrated chat interface powered by local Large Language Models (such as `llama3.2:1b` via Ollama).
* Allows natural language interrogation of long transcripts (e.g., "What was the testimony given regarding the vehicle location at 14:20?").
* Responses cite exact timestamps and speaker references.

### 6. Real-Time Telemetry and Queue Architecture
* Decoupled asynchronous task processing using Redis/BullMQ or RabbitMQ.
* Bidirectional WebSocket notifications via Socket.io for live job progress updates, eliminating client-side HTTP polling.
* Multi-tenant data model with role-based access control and an immutable credit ledger.

---

## System Architecture

```
+-----------------------------------------------------------------------------+
|                               Next.js Frontend                              |
|   (Waveform Visualizer | Snippet Labeler | Transcript Editor | RAG Drawer)  |
+-----------------------------------------------------------------------------+
                                       |
                   HTTP API / WebSocket (Socket.io)
                                       |
+-----------------------------------------------------------------------------+
|                       Backend API (Bun + Express)                           |
|  - Authentication & RBAC        - Credit Ledger & SaaS Controls             |
|  - Project & Asset Management   - Job Orchestrator (BullMQ / RabbitMQ)      |
+-----------------------------------------------------------------------------+
              |                                            |
      PostgreSQL 16                                 Redis 7 / PubSub
  (Transcripts, Users, Ledger)                   (State, Cache, Events)
              |
+-----------------------------------------------------------------------------+
|                      ML Processing Cluster (FastAPI)                        |
|  - PyTorch Audio Pipeline       - Whisper Speech-to-Text Engine             |
|  - Pyannote / WhisperX Diarize  - Voice Snippet Audio Slicer (FFmpeg)       |
|  - ChromaDB Vector Store        - Ollama Local LLM RAG Service              |
+-----------------------------------------------------------------------------+
                                       |
                             Cloud Media Storage
                           (Cloudinary / S3 CDN)
```

---

## Technology Stack

| Layer | Technologies | Role |
|---|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, Lucide Icons | Responsive user workspace, audio waveform playback, live editor, RAG chat |
| API Service | Bun, Express, TypeScript, node-pg-migrate | API gateway, auth, project management, queue dispatch, socket telemetry |
| ML & Workers | Python 3.12, FastAPI, PyTorch, Uvicorn, uv | Diarization, Whisper ASR, snippet generation, RAG agent executor |
| AI / Models | OpenAI Whisper, Pyannote Audio, Sentence Transformers (`all-MiniLM-L6-v2`), Ollama (`llama3.2`) | Speech-to-text, acoustic clustering, text vectorization, local language model inference |
| Vector Store | ChromaDB | Project-partitioned embedding index for conversational transcript retrieval |
| Datastores | PostgreSQL 16, Redis 7 | Structured system data, relational models, credit ledger, queue backend, socket bus |
| Message Queue | BullMQ (Redis) / RabbitMQ (AMQP) | Asynchronous task scheduling, background workers, decoupled audio processing |
| Observability | Prometheus, Loki, Promtail, Grafana | Metric collection, structured log ingestion, operational health dashboards |

---

## Project Structure

```
speaktrace/
├── api/                        Backend API service (Bun + Express + TypeScript)
│   ├── src/
│   │   ├── config/             Environment configuration and validation
│   │   ├── modules/            Domain modules (auth, projects, media, system)
│   │   ├── shared/             Database pool, base repositories, event buses
│   │   └── lib/                Cloud storage clients and queue adapters
│   └── docker/                 Docker configurations for API dependencies
├── ml/                         Machine learning and worker service (FastAPI + PyTorch)
│   ├── src/
│   │   ├── api/                Processing endpoints and task webhooks
│   │   ├── core/               Config, model loaders, vector client
│   │   ├── services/           Diarization, Whisper ASR, snippet slicing, RAG
│   │   └── main.py             Uvicorn application entrypoint
│   └── pyproject.toml          Python dependencies managed via uv
├── dashboard/                  Frontend web application (Next.js 16)
│   ├── src/
│   │   ├── app/                App Router pages (landing, dashboard, workspace)
│   │   ├── components/         Audio player, transcript editor, speaker modals
│   │   └── lib/                API client and WebSocket client hooks
├── docker/                     Infrastructure configurations
│   ├── prometheus/             Prometheus scraper metrics configuration
│   ├── loki/                   Grafana Loki log ingestion configuration
│   └── promtail/               Promtail log shipping configuration
├── docker-compose.yml          Multi-container orchestration for local development
├── Makefile                    Root workflow command shortcuts
├── HLD.md                      High-Level Design and architectural specification
├── WORKFLOW.md                 Detailed event lifecycle and data flow documentation
└── AGENTS.md                   System guide and rules for automated coding assistants
```

---

## Getting Started

### Prerequisites
* Docker and Docker Compose (v2.20+)
* Bun runtime (v1.1+)
* Node.js (v20+)
* Python 3.12 with uv package manager
* FFmpeg installed locally (for audio manipulation utilities)
* An active Ollama instance (or compatible local LLM provider)

### 1. Start Infrastructure Services
Launch PostgreSQL, Redis, RabbitMQ, Ollama, Prometheus, Loki, and Grafana:

```bash
make infra-up
```

Verify that all service containers are healthy:

```bash
docker compose ps
```

### 2. Configure Environment Variables
Copy the example environment configurations in each service directory:

```bash
# Backend API
cp api/.env.example api/.env

# ML Processing Service
cp ml/.env.example ml/.env

# Dashboard Frontend
cp dashboard/.env.example dashboard/.env
```

Ensure your storage credentials (Cloudinary or S3) and database connection strings are populated.

### 3. Run Database Migrations and Seed Data
Apply PostgreSQL schema migrations and load default system settings and test accounts:

```bash
make db-migrate
make db-seed
```

Default credentials seeded:
* Email: `test@speaktrace.com`
* Initial Balance: 10,000 credits
* Role: Member

### 4. Start the Application Services

Open separate terminals or run in parallel:

#### API Service (Bun + Express):
```bash
make dev-api
# Runs on http://localhost:8989
```

#### ML Processing Service (FastAPI + PyTorch):
```bash
make dev-ml
# Runs on http://localhost:8000
```

#### Dashboard Frontend (Next.js):
```bash
make dev-dashboard
# Runs on http://localhost:3000
```

---

## Workflow Walkthrough

1. **Project Creation & Media Ingestion**: Create a project workspace and upload an audio file (WAV, MP3, M4A, FLAC). The file is stored durably and an ingestion task is pushed to the queue.
2. **Audio Processing Pipeline**: The ML worker runs voice activity detection, segments the audio, clusters acoustic signatures into speaker groups, and isolates clean 1-5 second snippets.
3. **Speaker Review**: The dashboard alerts the user via WebSocket when speaker snippets are ready. The user plays each snippet and assigns real names.
4. **Transcription & Alignment**: Whisper synthesizes text with aligned timestamps, attributing every utterance to the identified speakers.
5. **Review & Formatting**: The user reviews the transcript in the web editor, modifies text as needed, and exports to WebVTT, TXT, or custom grammar templates.
6. **Conversational Interrogation**: The user can open the RAG assistant drawer to question the transcript, locate specific statements, and receive synthesized answers with direct timestamp citations.

---

## SaaS Governance and Credit Model

SpeakTrace includes a dynamic credit ledger to manage compute-intensive operations:

| Action | Cost Calculation | Description |
|---|---|---|
| User Onboarding | +50 Free Credits | Default allocation upon initial account creation |
| Audio Ingestion & Processing | 10 Credits / Minute | Rounded to next whole minute; covers VAD, Diarization, Whisper |
| Vector Indexing (ChromaDB) | Included with Job | Automated chunking and embedding generation |
| Conversational RAG Queries | Included with Workspace | Interrogation via local Ollama inference |

System costs, rate limits, and credit quotas can be modified without restarts via the PostgreSQL `system_settings` table.

---

## Observability and System Telemetry

SpeakTrace includes an integrated monitoring stack for production deployments:
* **Prometheus** (`:9090`): Tracks HTTP request latency, queue lengths, ML job durations, and API throughput.
* **Grafana Loki & Promtail** (`:3100`): Collects structured JSON logs across the API, workers, and infrastructure containers.
* **Grafana** (`:3001`): Provides unified dashboards for system health, database connection pools, and error tracking.

---

## Technical Documentation and Reports

For comprehensive engineering specifications, architectural diagrams, and research notes:
* [High-Level Design Specification](HLD.md)
* [End-to-End Workflow and Event Pipeline](WORKFLOW.md)
* [System Guide for AI Agents](AGENTS.md)
* Compiled Technical Report (`REPORT.pdf`) generated via Typst in `report/`

---

## License and Attribution

SpeakTrace is developed for research, open experimentation, and enterprise audio workflows.

For inquiries, contributions, or discussions regarding legal tech, speech AI, and automation workflows, submit an issue or start a repository discussion.
