# SpeakTrace: Technical Workflow & Architecture Specification

> **End-to-End Speech Intelligence & Conversational RAG Platform**  
> **Core Architecture:** Audio Ingestion $\to$ PyTorch Pyannote Diarization $\to$ Snippet-Assisted Speaker Identification $\to$ Whisper ASR & Custom Grammar Rendering $\to$ ChromaDB Vector Memory $\to$ LangChain / LangGraph Ollama RAG $\to$ Prometheus, Loki & Grafana Observability.

---

## Executive Summary

Traditional automated speech recognition (ASR) pipelines suffer from three structural limitations:
1. **Blind Speaker Labeling:** Diarization systems produce anonymous cluster identifiers (`SPEAKER_00`, `SPEAKER_01`) without any user-verifiable mechanism to associate voices with human identities prior to transcription.
2. **Rigid Output Schemas:** Subtitle export is typically constrained to generic formats, preventing domain-specific ingestion into downstream law enforcement, medical, or courtroom workflows.
3. **Isolated File Memory:** Transcriptions exist as siloed text documents, precluding cross-dialogue interrogation, temporal testimony cross-examination, or semantic querying across an entire project.

**SpeakTrace** is an event-driven B2B SaaS platform that solves these challenges:
- **Playable Voice Clones:** Diarizes multi-speaker audio and automatically extracts isolated 1s–5s vocal snippets for each detected voice, allowing users to listen to clean audio clips in a custom dashboard and assign real human identities (`Piush`, `Host`, `Witness`).
- **Dynamic Grammar Engine:** Transcribes dialogue with timestamp alignments and renders output into WebVTT, plain text, or arbitrary user-defined templates (e.g. `[$PERSON] said "$SPEECH" at [$START]s`).
- **Project-Level RAG Memory:** Automatically vectorizes transcripts into project-partitioned ChromaDB collections, enabling natural language questions (*"When did Piush speak first?"*, *"What was discussed at 03:15?"*) answered by local Ollama LLMs with timestamp citations.
- **SaaS Token Economy:** Provisions users with 50 default tokens (costing 10 tokens/min = 5 mins total) tracked via an immutable PostgreSQL credit ledger.
- **Full Observability:** Emits Prometheus metrics, structures JSON logs for Loki, and visualizes system health on Grafana.

---

## In Simple Words: How the Pipeline Works

1. **User Creates an Account & Project**: The user signs in via Better Auth (GitHub OAuth) and is credited **50 free tokens**. They create a project (e.g. *"Tech Founders Podcast"*), which acts as the scoping boundary for files and conversational RAG memory.
2. **Audio Upload & Cloud Storage**: The user drops an MP3, WAV, or MP4 file into the dashboard. The file streams directly to Cloudinary CDN, deducts tokens atomically at **10 tokens per minute**, and publishes a `media.uploaded` event to the message queue.
3. **PyTorch Diarization**: The Python ML worker consumes the event, normalizes the audio to 16kHz mono WAV, and runs Pyannote 3.1 to identify distinct speaker turn intervals.
4. **1s–5s Voice Snippet Extraction**: For each detected voice (`SPEAKER_00`, `SPEAKER_01`), the worker extracts a clean 1.5s–5.0s audio segment containing only that speaker, uploads it to Cloudinary, and transitions the job to `AWAITING_SPEAKER_MAPPING`.
5. **Interactive Voice Identification in UI**: The Next.js dashboard detects the state change via Server-Sent Events (SSE) and displays an interactive modal. The user plays each 1s–5s voice clip, hears the actual voice, types the person's name (e.g. `Piush`, `Host`), and clicks confirm.
6. **Whisper Transcription & Name Alignment**: The user's mappings are sent back to the queue (`speaker.mapping.submitted`). The worker transcribes the recording using Whisper, aligns timestamps with the assigned names, and replaces all raw speaker tags.
7. **Custom Grammar Rendering**: The transcript is formatted into WebVTT (`.vtt`), Plain Text (`.txt`), or a custom template (e.g. `[$PERSON] -> $SPEECH`), uploaded to Cloudinary, and saved to PostgreSQL.
8. **ChromaDB Vectorization**: The transcript segments are chunked with timestamp metadata (`[00:15s - 00:22s] Piush: ...`) and ingested into the project's ChromaDB collection.
9. **Conversational RAG with Ollama**: The user opens the Project RAG Assistant drawer in the dashboard and asks questions (*"What was the conclusion at minute 2?"*). A local Ollama LLM (`llama3.2:1b`) retrieves relevant chunks from ChromaDB and returns an analytical answer with **clickable timestamp citations**.
10. **Live Observability**: Prometheus scrapes metrics on ports `:8989` and `:8000`, Promtail streams structured logs to Loki on `:3100`, and Grafana displays real-time throughput on `:3001`.

---

## High-Level System Architecture

```mermaid
flowchart TD
    subgraph Client ["User Dashboard - Next.js (piush.in theme)"]
        UI["Dashboard UI / Projects Workspace"]
        SM["Speaker ID Modal - 1-5s Audio Clips"]
        RC["RAG Chat Drawer - Ollama QA"]
    end

    subgraph API_Layer ["API Backend - Bun + Express :8989"]
        AUTH["Better Auth + GitHub OAuth"]
        PROJ["Projects & Media Management"]
        LEDGER["Token Billing Ledger - 50 Free / 10 per min"]
        SSE["Server-Sent Events & Realtime Bus"]
        METRICS_API["Prometheus Exporter /metrics"]
    end

    subgraph Storage_Infrastructure ["Storage & Queues"]
        PG[("PostgreSQL 16")]
        REDIS[("Redis 7 - BullMQ")]
        RABBIT[("RabbitMQ 3.13 AMQP")]
        CLOUDINARY[("Cloudinary CDN - Audio & Transcripts")]
    end

    subgraph ML_Worker ["ML & RAG Engine - FastAPI + PyTorch :8000"]
        DIAR["Pyannote / Audio Diarizer"]
        SNIP["1-5s Snippet Slicer"]
        ASR["Whisper Speech-to-Text"]
        FMT["VTT / TXT / Custom Template Formatter"]
        CHROMA[("ChromaDB Vector Store")]
        OLLAMA["Ollama LLM - llama3.2:1b"]
    end

    subgraph Observability ["Observability Stack"]
        PROM["Prometheus Server :9090"]
        LOKI["Grafana Loki :3100"]
        PROMTAIL["Promtail Log Collector"]
        GRAFANA["Grafana Dashboard :3001"]
    end

    UI -->|HTTP / Better Auth| AUTH
    UI -->|Upload Audio & Create Projects| PROJ
    PROJ -->|Store Metadata| PG
    PROJ -->|Upload Media Buffer| CLOUDINARY
    PROJ -->|Debit 10 tokens/min| LEDGER
    PROJ -->|Publish media.uploaded| REDIS
    PROJ -->|Publish media.uploaded| RABBIT

    REDIS -->|Consume Job| DIAR
    RABBIT -->|Consume Job| DIAR
    DIAR -->|Extract Voice Clones| SNIP
    SNIP -->|Upload 1-5s Snippets| CLOUDINARY
    SNIP -->|Publish diarization.completed| REDIS

    REDIS -->|Update Job Status| SSE
    SSE -->|Push Awaiting Speaker Mapping| UI
    UI -->|Play Snippets & Submit Names| SM
    SM -->|POST /uploads/jobs/:id/speakers| PROJ
    PROJ -->|Publish speaker.mapping.submitted| REDIS

    REDIS -->|Resume Processing| ASR
    ASR -->|Align Transcripts with Names| FMT
    FMT -->|Upload VTT/TXT| CLOUDINARY
    FMT -->|Index Chunks with Timestamps| CHROMA
    FMT -->|Publish transcription.completed| REDIS

    RC -->|POST /api/rag/chat| OLLAMA
    OLLAMA -->|Context Retrieval| CHROMA

    METRICS_API -->|Scrape /metrics| PROM
    ML_Worker -->|Scrape /metrics| PROM
    API_Layer -->|Structured JSON Logs| PROMTAIL
    ML_Worker -->|Structured JSON Logs| PROMTAIL
    PROMTAIL -->|Ship Logs| LOKI
    PROM -->|Data Source| GRAFANA
    LOKI -->|Data Source| GRAFANA
```

---

## Step-by-Step Technical Workflow & Code Implementations

### Step 1: Ingestion, Cloudinary Streaming & Token Ledger Mathematics

When a user submits an audio or video file through the dashboard, the API calculates the required token deduction based on audio duration:

$$\text{Billable Minutes} = \left\lceil \frac{\max(\text{Duration}_{\text{sec}}, 60)}{60} \right\rceil$$

$$\text{Tokens Deducted} = \text{Billable Minutes} \times 10.00$$

The upload streams directly from memory to Cloudinary CDN, bypassing disk storage:

```typescript
// api/src/modules/uploads/uploads.service.ts
const uploadResult = await uploadToCloudinary(file.buffer, {
    folder: `speaktrace/${opts.tenantId ?? "public"}/${userId}`,
    resourceType: isVideo ? "video" : "raw",
    originalFilename: file.originalname,
});

// Calculate required token debit (10 tokens / minute)
const durationSec = Math.max(uploadResult.duration ?? 60, 60);
const durationMinutes = Math.ceil(durationSec / 60);
const totalCredits = durationMinutes * 10;

// Atomically debit credits from PostgreSQL ledger
await this.settingsService.deductJobCredits(userId, totalCredits, jobRow.id);
```

```sql
-- Deduct credits atomically with row-level lock and ledger transaction
UPDATE users 
SET credits = credits - $1, updated_at = NOW() 
WHERE id = $2 AND credits >= $1
RETURNING credits;

INSERT INTO credit_transactions (user_id, amount, balance_after, type, description, job_id)
VALUES ($1, -$2, $3, 'job_processing', 'Audio processing debit', $4);
```

---

### Step 2: Queue Event Envelope & Cross-Service Messaging

All inter-service communications between `api/` and `ml/` utilize a standardized domain event envelope compatible with both **BullMQ (Redis)** and **RabbitMQ (AMQP)**:

```json
{
  "event_id": "8f3b6c42-5e4a-4a2a-9e61-ebd819bb2026",
  "event_type": "media.uploaded",
  "occurred_at": "2026-09-12T13:30:00.000Z",
  "job_id": "d1c2b3a4-0000-4000-8000-0123456789ab",
  "tenant_id": "tenant-uuid",
  "project_id": "proj-uuid",
  "correlation_id": "trace-uuid",
  "idempotency_key": "idemp-uuid",
  "payload": {
    "media_asset_id": "asset-uuid",
    "storage_url": "https://res.cloudinary.com/demo/video/upload/interview.mp3",
    "mime_type": "audio/mpeg",
    "options": {
      "export_format": "vtt",
      "custom_template": null
    }
  }
}
```

```typescript
// api/src/lib/events.ts
export function publishMediaUploaded(params: UploadEventParams): void {
    const envelope = buildEnvelope("media.uploaded", params);
    if (env.QUEUE_PROVIDER === "bullmq") {
        getQueueProvider().enqueue({
            queue: "media.uploaded",
            name: "media.uploaded",
            data: envelope,
            deduplicationId: params.jobId,
        });
    } else {
        rabbitMQ.publish("media.uploaded", envelope);
    }
}
```

---

### Step 3: PyTorch Speaker Diarization

The Python ML worker consumes the `media.uploaded` job, downloads the media stream, and normalizes it to a standardized 16kHz 16-bit mono WAV format using `pydub` and `ffmpeg`:

```python
# ml/src/pipeline/downloader.py
audio = AudioSegment.from_file(raw_temp_path)
audio = audio.set_frame_rate(16000).set_channels(1)
audio.export(output_wav_path, format="wav")
```

The diarization engine detects speech boundaries and groups turns by speaker identity. If official Pyannote model weights and `HF_TOKEN` are present, Pyannote 3.1 is invoked; otherwise, a robust voice-activity segmenter executes:

```python
# ml/src/pipeline/diarizer.py
def run_diarization(audio_wav_path: str) -> list[dict]:
    if settings.hf_token:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=settings.hf_token,
        )
        diarization = pipeline(audio_wav_path)
        return [
            {"speaker": spk, "start": round(turn.start, 2), "end": round(turn.end, 2)}
            for turn, _, spk in diarization.itertracks(yield_label=True)
        ]
    
    # Robust Voice Activity Detection Fallback
    sound = AudioSegment.from_wav(audio_wav_path)
    nonsilent = detect_nonsilent(sound, min_silence_len=400, silence_thresh=-36)
    # Segments clustered into SPEAKER_00, SPEAKER_01 based on pause gaps
    ...
```

---

### Step 4: 1s–5s Speaker Voice Snippet Extraction

For each distinct speaker cluster detected, the pipeline isolates an audio segment of **1.5s to 5.0s** where only that speaker is talking. This creates a voice snippet used by the client dashboard for speaker identification:

$$\text{Snippet}(k) = \arg\max_{s_i \in \mathcal{S}_k, 1.5 \le \Delta t_i \le 5.0} (\Delta t_i)$$

```python
# ml/src/pipeline/snippet_extractor.py
def extract_speaker_snippets(audio_wav_path: str, segments: list[dict], job_id: str) -> list[dict]:
    sound = AudioSegment.from_wav(audio_wav_path)
    snippets = []

    for spk_tag, spk_segments in group_by_speaker(segments).items():
        # Select optimal single-speaker window between 1.5s and 5.0s
        best_seg = find_optimal_window(spk_segments, min_sec=1.5, max_sec=5.0)
        start_ms = int(best_seg["start"] * 1000)
        end_ms = min(int(best_seg["end"] * 1000), start_ms + 5000)
        
        # Export isolated clip to temporary MP3
        snippet_chunk = sound[start_ms:end_ms]
        snippet_chunk.export(tmp_path, format="mp3", bitrate="128k")
        
        # Upload snippet to Cloudinary CDN
        upload_res = cloudinary.uploader.upload(
            tmp_path,
            public_id=f"speaktrace/snippets/{job_id}/{spk_tag.lower()}",
            resource_type="video",
            overwrite=True,
        )
        snippets.append({
            "speaker_tag": spk_tag,
            "snippet_url": upload_res["secure_url"],
            "duration_seconds": round((end_ms - start_ms) / 1000.0, 2),
        })
    return snippets
```

The worker emits `diarization.completed` with the snippet URLs and pauses the job in `AWAITING_SPEAKER_MAPPING`.

---

### Step 5: Interactive Speaker Labeling UI (Next.js Dashboard)

When the job enters `AWAITING_SPEAKER_MAPPING`, the Next.js dashboard triggers the **Speaker Identification Modal**. The user listens to each speaker's voice via an inline HTML5 audio player and inputs the real name:

```tsx
// dashboard/src/components/speakers/SpeakerModal.tsx
<div className="flex items-center gap-3">
  <button
    type="button"
    onClick={() => handlePlayToggle(spk.speaker_tag)}
    className="w-10 h-10 rounded-full bg-[#d7f36b] text-[#17221d] flex items-center justify-center"
  >
    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
  </button>
  <audio ref={(el) => (audioRefs.current[spk.speaker_tag] = el)} src={spk.snippet_url} />
  
  <input
    type="text"
    value={names[spk.speaker_tag] || ""}
    onChange={(e) => handleNameChange(spk.speaker_tag, e.target.value)}
    placeholder="e.g. Piush, Host..."
    className="px-3 py-2 rounded border border-[var(--line)] bg-[var(--card)] text-xs font-mono"
  />
</div>
```

Submitting calls `POST /api/v1/uploads/jobs/:jobId/speakers`, which updates the database and publishes `speaker.mapping.submitted`.

---

### Step 6: Whisper Speech-to-Text & Speaker Alignment

The ML worker receives `speaker.mapping.submitted` and resumes transcription. Whisper (`faster-whisper`) extracts word timestamps, which are aligned to the diarized intervals:

$$t_{\text{midpoint}} = \frac{t_{\text{start}} + t_{\text{end}}}{2}$$

$$\text{Assigned Speaker} = \mathcal{M}\left( \text{DiarizationInterval}(t_{\text{midpoint}}) \right)$$

```python
# ml/src/pipeline/transcriber.py
def transcribe_and_align(audio_wav_path: str, diarized_segments: list[dict], mappings: dict[str, str]):
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments_gen, _ = model.transcribe(audio_wav_path, beam_size=5)

    aligned = []
    for t_seg in segments_gen:
        t_mid = (t_seg.start + t_seg.end) / 2.0
        # Match segment midpoint with diarization interval
        matched_tag = next(
            (d["speaker"] for d in diarized_segments if d["start"] <= t_mid <= d["end"]),
            "SPEAKER_00",
        )
        # Substitute with user-assigned name (e.g. SPEAKER_00 -> "Piush")
        final_name = mappings.get(matched_tag, matched_tag)
        aligned.append({
            "speaker": final_name,
            "start": round(t_seg.start, 2),
            "end": round(t_seg.end, 2),
            "text": t_seg.text.strip(),
        })
    return aligned
```

---

### Step 7: Custom Grammar & Format Rendering

The aligned transcript is parsed and rendered into the format selected by the user:

#### A. WebVTT Subtitle Rendering (`.vtt`)
```vtt
WEBVTT

1
00:00:01.000 --> 00:00:04.200
<v Piush>Hey, welcome to this systems engineering session.</v>

2
00:00:04.500 --> 00:00:08.100
<v Host>Hi Piush, excited to explore event streaming and speaker diarization!</v>
```

#### B. Dynamic Custom Grammar Template
Users can supply arbitrary grammar templates using variables:
```python
# Template: "[$PERSON] said: \"$SPEECH\" (at [$START]s)\n***"
def render_custom_template(segments: list[dict], template: str) -> str:
    rendered = []
    for seg in segments:
        block = (
            template
            .replace("[$PERSON]", seg["speaker"])
            .replace("$PERSON", seg["speaker"])
            .replace("[$SPEECH]", seg["text"])
            .replace("$SPEECH", seg["text"])
            .replace("[$START]", str(seg["start"]))
            .replace("[$END]", str(seg["end"]))
        )
        rendered.append(block)
    return "\n".join(rendered)
```

The rendered file is uploaded to Cloudinary (`resource_type="raw"`) and stored in PostgreSQL.

---

### Step 8: Project-Level ChromaDB RAG Vector Memory & Document-to-Embedding Ratios

Whenever a job completes, its aligned transcript turns are vectorized and ingested into ChromaDB. To achieve state-of-the-art semantic search accuracy over colloquial spoken dialogue, SpeakTrace implements a specialized **Document-to-Embedding Ratio** and chunk geometry.

#### A. The Conversational Chunking Geometry Problem
Unlike static encyclopedic text or documentation, conversational speech audio presents unique retrieval challenges:
1. **Low Information Density & High Colloquialism**: Spoken sentences contain filler words, false starts, and fragmented phrasing.
2. **Contextual Dependency Across Speaker Turns**: An isolated answer (*"Yes, exactly 40%."*) is meaningless without the preceding query (*"What reduction in database latency did you observe?"*).
3. **Temporal Precision Requirement**: Downstream users require precise timecodes for legal, journalistic, or podcast verification.

#### B. Mathematical Formulation of Chunk Ratios
SpeakTrace groups segments into contiguous conversational units using an adaptive turn window:

$$\mathcal{C}_i = \bigcup_{j=m}^{m+N} \left[ t_{\text{start}}^{(j)}, t_{\text{end}}^{(j)} \right] \times \text{Speaker}^{(j)} \times \text{Text}^{(j)}$$

Where:
- **Turn Window Size ($N$)**: $1 \le N \le 3$ contiguous speaker turns (typically 80–150 words / ~110–200 tokens).
- **Token Overlap ($\delta$)**: 1 turn overlap between windows to preserve inter-turn causality.
- **Embedding Space**: `sentence-transformers/all-MiniLM-L6-v2` projecting text into a dense 384-dimensional hypersphere $\mathbb{R}^{384}$.
- **Distance Metric**: Cosine Similarity $S_C(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2}$.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DOCUMENT-TO-EMBEDDING RATIO                           │
├────────────────────────────────┬────────────────────────────────────────────┤
│ Average Chunk Word Count       │ 80 – 150 words                             │
│ Average Token Length           │ 110 – 200 tokens                           │
│ Embedding Vector Dimensionality│ 384 dimensions (float32)                   │
│ Compression / Density Factor   │ ~0.35 tokens per vector dimension          │
│ Top-K Retrieval Window ($k$)   │ 4 to 6 chunks                              │
│ Retrieved Context Token Budget │ 600 – 900 tokens                           │
│ LLM Context Window Occupancy   │ 15% – 22% of Ollama 4,096 token limit      │
└────────────────────────────────┴────────────────────────────────────────────┘
```

**Why this ratio is optimal**:
- If chunks are too small ($<40$ words), single-word answers lose their question context, degrading cosine similarity against analytical questions.
- If chunks are too large ($>350$ words), multiple unrelated topics get averaged into a single 384-dim vector, creating vector dispersion and reducing top-k precision.
- At **~120 words per embedding**, the semantic representation preserves conversational intent while maintaining high retrieval selectivity.
- Allocating **~750 tokens** to retrieved context leaves $>75\%$ of the LLM's prompt window for multi-step reasoning, synthesis, and timestamp citation generation.

#### C. Vector Store Ingestion & Multi-Audio Re-population
```python
# ml/src/rag/indexer.py
def index_transcription_segments(
    project_id: str,
    job_id: str,
    segments: list[dict],
    audio_url: str | None = None,
    filename: str | None = None,
) -> int:
    """Indexes transcription segments into a project-partitioned ChromaDB collection."""
    collection = get_project_collection(project_id)
    
    ids = []
    documents = []
    metadatas = []
    
    for i, seg in enumerate(segments):
        chunk_id = f"{job_id}_{i}"
        # Format text with temporal prefix for contextual embedding
        doc_text = f"[{format_time(seg['start'])} - {format_time(seg['end'])}] {seg['speaker']}: {seg['text']}"
        
        ids.append(chunk_id)
        documents.append(doc_text)
        metadatas.append({
            "job_id": job_id,
            "project_id": project_id,
            "speaker": seg["speaker"],
            "start_time": float(seg["start"]),
            "end_time": float(seg["end"]),
            "audio_url": audio_url or "",
            "filename": filename or "",
        })
    
    collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
    return len(documents)
```

Whenever a user processes an additional audio file in an existing project, `index_transcription_segments` automatically indexes the new recording into the existing project collection (`proj_{project_id}`). Users can seamlessly query cross-session knowledge across all audio files in the project without manual re-indexing.

---

### Step 9: Token-by-Token Streaming RAG Agent & Rich Markdown UI

Instead of making users wait for complete LLM generation, SpeakTrace streams responses token-by-token with formatted Markdown and interactive playable audio citations:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  CONVERSATIONAL STREAMING RAG PIPELINE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ User Query ──> ChromaDB HNSW (Top-K=6) ──> Context Builder ──> Ollama Stream│
│                                                                     │       │
│ UI MarkdownRenderer <── Token Stream (SSE) <── FastAPI StreamingResponse    │
│  ├── Dynamic Headers, Tables, & Lists                                       │
│  ├── Syntax-Highlighted Code Blocks with Copy Button                        │
│  └── Playable Citation Badges [00:01:14] ──> Seeks HTML5 Audio Scrubber     │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### A. Backend Streaming Generator
```python
# ml/src/rag/agent.py
async def stream_project_rag(project_id: str, query: str):
    collection = get_project_collection(project_id)
    results = collection.query(query_texts=[query], n_results=6)
    
    context_blocks = []
    citations = []
    for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
        context_blocks.append(doc)
        citations.append({
            "speaker": meta.get("speaker"),
            "start_time": meta.get("start_time"),
            "end_time": meta.get("end_time"),
            "audio_url": meta.get("audio_url"),
            "filename": meta.get("filename"),
        })

    system_prompt = (
        "You are SpeakTrace AI, an expert analytical assistant. "
        "Analyze the conversation transcripts and answer the user's questions thoughtfully. "
        "Do not simply quote or copy-paste text; explain the concepts, provide summaries, and synthesize details. "
        "Cite timestamps in [HH:MM:SS] format."
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST",
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": settings.ollama_model,
                "messages": [
                    {"role": "system", "content": f"{system_prompt}\n\nCONTEXT:\n" + "\n".join(context_blocks)},
                    {"role": "user", "content": query},
                ],
                "stream": True,
            },
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content", "")
                    yield f"data: {json.dumps({'token': chunk})}\n\n"
            
            # Send citations metadata at stream termination
            yield f"data: {json.dumps({'citations': citations, 'done': True})}\n\n"
```

#### B. Markdown Parser & Playable Citations
The frontend passes streaming text through `MarkdownRenderer.tsx`:
- **Headings & Lists**: Formatted with peaceful emerald dividers and bullet accents.
- **Code Blocks**: Formatted with syntax backgrounds, language tags, and single-click copy buttons.
- **Playable Citations**: Clicking any citation badge `[00:01:14]` dispatches an event to the audio player, seeking and playing the exact recorded phrase.

---

### Step 10: WebSocket & Real-Time Event Architecture

SpeakTrace utilizes bidirectional **Socket.io** WebSockets and **Redis Pub/Sub** to eliminate HTTP client polling and prevent rate-limiting:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Next.js Dashboard
    participant API as Express API (:8989)
    participant Redis as Redis Pub/Sub
    participant ML as ML Worker (:8000)

    UI->>API: Connect WebSocket (Socket.io handshake)
    UI->>API: Join project room ("project:proj-uuid")
    ML->>Redis: Publish ("job.progress.updated", pct=50, stage="Diarizing")
    Redis->>API: Message received on channel
    API->>UI: Emit "job.progress.updated" to project room
    ML->>Redis: Publish ("transcription.completed")
    Redis->>API: Ingest transcript & update DB
    API->>UI: Emit "speaktrace_user_updated" (live token debit)
    API->>UI: Emit "job.completed"
```

1. **Elimination of Polling**: The dashboard previously polled `/jobs` every 2 seconds, triggering CORS issues and self-rate-limiting. The WebSocket connection streams updates instantly.
2. **Live Token Synchronization**: Every upload, transcription completion, or RAG query deducts credits and triggers `speaktrace_user_updated`, updating user balances in the navbar without requiring page reloads.

---

### Step 11: Observability Stack, Log Isolation & Grafana Telemetry

SpeakTrace provisions enterprise observability via Prometheus, Promtail, Grafana Loki, and Grafana:

#### A. Structured JSON Logging Architecture
Both the API (`winston`) and ML Worker (`python-json-logger`) output structured JSON logs to mounted disk directories:
- `./api/logs/combined.log` $\to$ `/app_logs/api/combined.log`
- `./ml/logs/ml.log` $\to$ `/app_logs/ml/ml.log`

Promtail scrapes these mounted logs, automatically parsing timestamps, levels, job IDs, and container labels:
```yaml
# docker/promtail/promtail-config.yml
scrape_configs:
  - job_name: speaktrace-app-logs
    static_configs:
      - targets: [localhost]
        labels:
          job: speaktrace-apps
          __path__: /app_logs/**/*.log
    pipeline_stages:
      - match:
          selector: '{__path__=~"/app_logs/api/.*"}'
          stages:
            - static_labels:
                container: speaktrace-api
      - match:
          selector: '{__path__=~"/app_logs/ml/.*"}'
          stages:
            - static_labels:
                container: speaktrace-ml
```

#### B. Log Isolation in Grafana
To keep application debugging clean and prevent noise:
1. **Application Engine Log Aggregator (Panel 7)**:
   Strictly queries application services:
   ```logql
   {container=~"speaktrace-(api|ml)"}
   ```
   Formatted with multiline support, level badges, and timestamp column headers.
2. **Observability Infrastructure Log Aggregator (Panel 8)**:
   Dedicated panel at the bottom of the dashboard for telemetry containers:
   ```logql
   {container=~"speaktrace-(prometheus|loki|grafana|promtail)"}
   ```

#### C. Prometheus Metrics & Grafana Dashboards
- **Audio Processing Stage Latency (Panel 6)**: Measures durations across `diarization`, `snippet_extraction`, `transcription`, and `rag_indexing`.
- **ML Jobs Processed by Status (Panel 106)**: Tracks `success` and `failure` job states.
- **API Request Rates & P95 Latency**: Measured via `express-prom-bundle`.

---

### Step 12: Landing Page Transcript Alignment & Visual Spectrum

#### A. Landing Page Design Alignment in Transcript Viewer
The Transcripts tab format strictly mirrors the promised landing page aesthetic:
1. **Timestamp Pill**: Green pill badge (`00:01:14`) formatted in clean `HH:MM:SS`. Clickable to jump audio to that exact timestamp.
2. **Speaker Name**: Bold colored name tag (`Sarah (Host):` / `David (Founder):`).
3. **Dialogue Speech Text**: Indented with a vertical emerald bar on the left (`border-l-2 border-emerald-500/35 pl-3`).
4. **Sequence Number at the Very End**: Rendered on the far right edge of the cue header (`#01`, `#02`, `#03`).
5. **Ready to Export Status**: Subheader featuring `RESULTING TRANSCRIPT WITH LABELS` and active pulsing `Ready to Export` indicator.

#### B. HTML5 Canvas Audio Spectrum Visualizer
The dashboard includes an interactive frequency spectrum:
- 48 frequency bars rendered in HTML5 Canvas.
- Real-time animated oscillation proportional to playback time.
- Integrated audio scrubbing, volume slider, and persistent file renaming (`PATCH /uploads/jobs/:jobId/rename`).


---

## Event-Driven State Machine & Transition Matrix

```mermaid
stateDiagram-v2
    [*] --> UPLOADED
    UPLOADED --> AUDIO_EXTRACTED
    AUDIO_EXTRACTED --> DIARIZATION_DONE
    DIARIZATION_DONE --> AWAITING_SPEAKER_MAPPING
    AWAITING_SPEAKER_MAPPING --> TRANSCRIPTION_IN_PROGRESS
    TRANSCRIPTION_IN_PROGRESS --> POSTPROCESSING_IN_PROGRESS
    POSTPROCESSING_IN_PROGRESS --> RAG_INDEXING_IN_PROGRESS
    RAG_INDEXING_IN_PROGRESS --> COMPLETED
    COMPLETED --> [*]

    UPLOADED --> FAILED
    AUDIO_EXTRACTED --> FAILED
    DIARIZATION_DONE --> FAILED
    TRANSCRIPTION_IN_PROGRESS --> FAILED
    POSTPROCESSING_IN_PROGRESS --> FAILED
```

| Lifecycle State | Queue Event Trigger | Service Owner | Next State Action |
| :--- | :--- | :--- | :--- |
| `UPLOADED` | `media.uploaded` | `api/` | Audio downloaded and normalized to 16kHz WAV. |
| `AUDIO_EXTRACTED` | `job.progress.updated (20%)` | `ml/` | Audio stream ready; Pyannote diarization begins. |
| `DIARIZATION_DONE` | `job.progress.updated (40%)` | `ml/` | Speaker intervals detected; snippet slicing begins. |
| `AWAITING_SPEAKER_MAPPING`| `diarization.completed (60%)` | `ml/` $\to$ `dashboard/`| **Pause Checkpoint:** User listens to 1s–5s voice snippets in modal and assigns names. |
| `TRANSCRIPTION_IN_PROGRESS`| `speaker.mapping.submitted (75%)` | `dashboard/` $\to$ `ml/`| Whisper transcribes speech; aligned with mapped names. |
| `POSTPROCESSING_IN_PROGRESS`| `job.progress.updated (85%)` | `ml/` | Formats output (VTT/TXT/Custom); uploads to Cloudinary. |
| `RAG_INDEXING_IN_PROGRESS`| `job.progress.updated (95%)` | `ml/` | Ingests chunks into project ChromaDB vector collection. |
| `COMPLETED` | `transcription.completed (100%)` | `ml/` $\to$ `api/` | Full transcript ready for download and RAG queries. |
| `FAILED` | `job.failed` | `ml/` / `api/` | Compensation logic records error; refunds tokens if applicable. |

---

## SaaS Credit & Token Economics

Every new self-registered user receives **50.00 free credits**. Audio processing costs **10.00 credits per minute**:

| Audio Length | Billable Minutes | Token Debit | Remaining Tokens (from 50) | Total Audio Remaining |
| :---: | :---: | :---: | :---: | :---: |
| **30 seconds** | 1 min ceiling | 10 tokens | 40 tokens | 4 minutes |
| **1 minute 15 seconds** | 2 min ceiling | 20 tokens | 30 tokens | 3 minutes |
| **3 minutes 00 seconds** | 3 min ceiling | 30 tokens | 20 tokens | 2 minutes |
| **4 minutes 45 seconds** | 5 min ceiling | 50 tokens | 0 tokens | 0 minutes |

---

## Database Schema & Entity-Relationship Architecture

```sql
-- Core users & authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    plan TEXT NOT NULL DEFAULT 'free',
    credits NUMERIC(12, 2) NOT NULL DEFAULT 50.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects (scoping boundary for files and RAG memory)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Media assets (uploaded recordings)
CREATE TABLE media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    duration_seconds NUMERIC(10, 3),
    storage_provider TEXT NOT NULL DEFAULT 'cloudinary',
    storage_public_id TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Processing jobs (pipeline state machine)
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    current_stage TEXT,
    progress_pct SMALLINT NOT NULL DEFAULT 0,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Isolated 1s–5s speaker snippets for user verification
CREATE TABLE job_speakers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    speaker_tag TEXT NOT NULL,          -- e.g. 'SPEAKER_00'
    snippet_url TEXT NOT NULL,          -- Playable 1s-5s audio clip URL
    duration_seconds NUMERIC(6, 2) DEFAULT 3.0,
    assigned_name TEXT,                 -- User-labeled name (e.g. 'Piush')
    confidence NUMERIC(4, 3) DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rendered output transcripts
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    format TEXT NOT NULL DEFAULT 'vtt',
    storage_url TEXT,
    content_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable credit audit ledger
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    job_id UUID REFERENCES processing_jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Environment Variables Reference

### 1. Express API Backend (`api/.env`)
| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://piush:root_123_allmighty@localhost:5432/speaktrace_db` |
| `REDIS_URL` | Redis connection for BullMQ queues | `redis://localhost:6379` |
| `QUEUE_PROVIDER` | Active queue backbone (`bullmq` or `rabbitmq`) | `bullmq` |
| `RABBITMQ_URL` | AMQP URL for RabbitMQ broker | `amqp://speaktrace:speaktrace_pass@localhost:5672/speaktrace` |
| `JWT_SECRET` | Secret key for JWT signing | Strong random string |
| `BETTER_AUTH_SECRET`| Better Auth encryption key | Strong random string |
| `GITHUB_CLIENT_ID` | GitHub OAuth application client ID | Obtained from GitHub Developer settings |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth application client secret | Obtained from GitHub Developer settings |
| `CLOUDINARY_URL` | Cloudinary credentials URL | `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `PORT` | API server listen port | `8989` |

### 2. Python ML Worker (`ml/.env`)
| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `APP_PORT` | FastAPI listen port | `8000` |
| `REDIS_URL` | Redis connection for BullMQ polling | `redis://localhost:6379` |
| `QUEUE_PROVIDER` | Active queue provider | `bullmq` |
| `CLOUDINARY_URL` | Cloudinary credentials URL | `cloudinary://<api_key>:<api_secret>@<cloud_name>` |
| `OLLAMA_BASE_URL` | Ollama HTTP endpoint | `http://localhost:11434` |
| `OLLAMA_MODEL` | Local LLM model identifier | `llama3.2:1b` |
| `CHROMA_PERSIST_DIR`| Local filesystem directory for vector store | `./chroma_db` |
| `HF_TOKEN` | Hugging Face token for official Pyannote weights | `hf_...` (optional, fallback active if unset) |

### 3. Next.js User Dashboard (`dashboard/.env.local`)
| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL`| Frontend URL | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL`| Backend API prefix | `http://localhost:8989/api/v1` |
| `NEXT_PUBLIC_ML_URL` | ML Service prefix for RAG chat | `http://localhost:8000` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID (matches backend) | Obtained from GitHub |
| `GITHUB_CLIENT_SECRET`| GitHub OAuth client secret | Obtained from GitHub |
| `BETTER_AUTH_SECRET`| Better Auth secret | Strong random string |

---

## Developer Quickstart & Orchestration Commands

```bash
# 1. Start full Docker infrastructure & observability stack
make infra-up
# Launches:
#  - PostgreSQL (port 5432)
#  - Redis (port 6379)
#  - RabbitMQ (port 5672, UI 15672)
#  - Ollama (port 11434)
#  - Prometheus (port 9090)
#  - Loki (port 3100)
#  - Grafana (port 3001, admin/admin)

# 2. Run API database migrations & seed 50 default tokens
cd api
bun run db:migrate
bun run db:seed
bun run dev           # Starts Express API on http://localhost:8989

# 3. Start ML worker & RAG engine
cd ml
uv sync
uv run python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

# 4. Start Next.js user dashboard
cd dashboard
bun run dev           # Starts user dashboard on http://localhost:3000
```
