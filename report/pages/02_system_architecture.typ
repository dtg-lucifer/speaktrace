#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= System Architecture & Inter-Service Topology

== Distributed Multi-Tier Topology

SpeakTrace adopts an asynchronous, event-driven polyglot architecture separating high-concurrency API orchestration from GPU/CPU-intensive machine learning workloads.

#table(
  columns: (1fr, 1.2fr, 2.2fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else if calc.even(row) { rgb("#f8fafc") } else { none },
  align: (left, left, left),
  table.header(
    [*Sub-System*],
    [*Technology Stack*],
    [*Primary Architectural Responsibility*]
  ),
  [User Dashboard], [Next.js 16, React 19, TailwindCSS, Socket.io], [Interactive speaker modal, real-time waveform visualizer, streaming RAG chat.],
  [API Gateway], [Bun runtime, Express, TypeScript], [Auth management, token debit ledger, asset metadata, WebSocket event dispatch.],
  [Queue Broker], [Redis 7 (BullMQ) / RabbitMQ 3.13], [Durable job buffering, deduplication, and cross-service event streaming.],
  [ML Processing], [Python 3.12, FastAPI, PyTorch, Pyannote 3.1], [16kHz resampling, speaker turn clustering, 1s–5s snippet slicing, Whisper ASR.],
  [Vector Memory], [ChromaDB, all-MiniLM-L6-v2], [Project-scoped dense vector collections, HNSW indexing, top-k similarity search.],
  [Language Model], [Ollama Engine, Llama-3.2:1b], [Context synthesis, analytical answers, timestamp citation generation.],
  [Telemetry], [Prometheus, Promtail, Grafana Loki, Grafana], [Metrics aggregation, structured JSON file log shipping, performance dashboards.]
)

#v(8pt)
#callout(
  title: "Why Bun + Python Polyglot Architecture?",
  label: "DESIGN RATIONALE",
  [
    Bun provides ultra-fast native TypeScript execution, microsecond HTTP cold-starts, and robust WebSocket handling on port `:8989`. Conversely, deep-learning audio models (PyTorch, Pyannote, Faster-Whisper, and ChromaDB) require native C/CUDA bindings and the mature Python scientific ecosystem. Separating these into distinct services decoupled by message queues prevents heavy CPU/GPU matrix computations from blocking HTTP response loops.
  ]
)

== Standardized Domain Event Envelope

All inter-service communications adhere to an immutable JSON event schema supporting both BullMQ and RabbitMQ:

```json
{
  "event_id": "c56a8940-9e61-4150-98ab-8ae008362026",
  "event_type": "media.uploaded",
  "occurred_at": "2026-09-12T13:30:00.000Z",
  "job_id": "d1c2b3a4-0000-4000-8000-0123456789ab",
  "tenant_id": "tenant-uuid-100",
  "project_id": "cbbfdb0f-1520-468f-b3e2-8162388f4f78",
  "correlation_id": "corr-uuid-999",
  "idempotency_key": "idemp-uuid-444",
  "payload": {
    "media_asset_id": "asset-uuid-555",
    "storage_url": "https://res.cloudinary.com/.../sample.mp3",

    "mime_type": "audio/mpeg",
    "original_filename": "Quarterly_Earnings.mp3",
    "options": {
      "export_format": "vtt",
      "custom_template": null
    }
  }
}
```

== Dual-Queue Provider Architecture (`QUEUE_PROVIDER`)

SpeakTrace includes a pluggable queue abstraction allowing deployment environments to alternate between Redis BullMQ and RabbitMQ AMQP via environment configuration:

```typescript
// api/src/shared/queue/queue.provider.ts
export interface IQueueProvider {
  enqueue(job: QueueJobEnvelope): Promise<void>;
  subscribe(
    queueName: string,
    handler: (job: QueueJobEnvelope) => Promise<void>
  ): Promise<void>;
  close(): Promise<void>;

}

export function getQueueProvider(): IQueueProvider {
  if (env.QUEUE_PROVIDER === "bullmq") {
    return BullMQProvider.getInstance();
  }
  return RabbitMQProvider.getInstance();
}
```

This flexibility guarantees smooth development locally via lightweight Redis, while enabling enterprise clusters to deploy RabbitMQ for cross-cloud polyglot routing.
