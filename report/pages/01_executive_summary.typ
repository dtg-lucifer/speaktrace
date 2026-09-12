#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= Executive Summary & Product Vision

== The Conversational Speech Intelligence Gap

Traditional automated speech recognition (ASR) pipelines have advanced significantly in raw word error rate (WER), yet they suffer from four foundational architectural limitations when deployed in production enterprise, legal, or journalistic environments:

1. *Blind Speaker Clustering*: State-of-the-art diarization models (such as Pyannote or WhisperX) assign anonymous cluster identifiers (`SPEAKER_00`, `SPEAKER_01`) based purely on acoustic embeddings. There is no human-in-the-loop mechanism to preview or verify which cluster belongs to which individual before entire transcripts are rendered.
2. *Rigid Subtitle Formatting*: Most transcription engines force output into standard SubRip (`.srt`) or generic WebVTT (`.vtt`) schemas. Domain-specific workflows (such as legal deposition logs, court stenography, or podcast editing) require dynamic, user-defined grammar templates (e.g. `[$PERSON] -> $SPEECH`).
3. *Siloed Text Memory*: Generated transcripts remain static documents. Users cannot easily interrogate long conversations, cross-examine testimony, or query temporal facts without manually reading hours of text.
4. *Inefficient Polling & High Cloud Costs*: Typical ASR web applications continuously poll backend status endpoints, overwhelming servers with redundant HTTP requests and causing rate limits during intensive audio processing.

#v(8pt)
#takeaway(
  title: "The SpeakTrace Architectural Paradigm",
  label: "CORE VALUE PROPOSITION",
  [
    *SpeakTrace* bridges the gap between deep-learning acoustic pipelines and end-user verification. By combining *PyTorch voice snippet extraction*, *playable 1s–5s human-in-the-loop identification*, *project-partitioned ChromaDB vector storage*, *streaming local LLM RAG*, and *bidirectional WebSocket telemetry*, SpeakTrace transforms raw multi-speaker recordings into verified, queryable, and auditable knowledge graphs.
  ]
)

== Product Capabilities & Technical Highlights

SpeakTrace is built as an enterprise-grade, event-driven SaaS platform offering seven interconnected sub-systems:

- *Automated Voice Snippet Slicing*: Extracts isolated 1.5s to 5.0s vocal samples for every detected speaker cluster and serves them through Cloudinary CDN.
- *Interactive Speaker Identification UI*: A Next.js 16 dashboard presents playable audio snippets, enabling users to hear isolated voices and label real identities (`Sarah (Host)`, `David (Founder)`) in seconds.
- *Whisper ASR & Word-Timestamp Alignment*: Accurately aligns speech segments to verified human names and generates WebVTT, plain text, and custom grammar formats.
- *Project-Scoped Vector RAG*: Employs an optimal *110–200 token Document-to-Embedding Ratio* using `all-MiniLM-L6-v2` in ChromaDB, empowering users to query transcripts with natural language.
- *Token-by-Token Streaming LLM*: Connects to local Ollama models (`llama3.2:1b`), streaming responses with formatted Markdown and *playable audio citation pills*.
- *Bidirectional Event Backbone*: Replaces client polling with Socket.io WebSockets and Redis Pub/Sub for zero-latency UI updates.
- *Full-Stack Observability*: Scrapes metrics into Prometheus, structures JSON logs in Promtail/Loki, and renders live operational dashboards in Grafana.

#v(8pt)
#challenge-box(
  challenge: "Anonymous Speaker Tagging in Multi-Party Recordings",
  problem: "Diarization models cluster acoustic features accurately, but humans cannot decipher which anonymous cluster (e.g. SPEAKER_02) corresponds to which speaker without tedious manual scrubbing across the entire recording.",
  solution: "SpeakTrace's automated snippet extractor isolates high-confidence 1s–5s continuous speech turns per cluster and generates playable audio cards in the frontend, enabling single-click human verification prior to final transcription."
)

== SaaS Token Economy & Dynamic Pricing

SpeakTrace enforces a credit ledger to manage computational resources across heavy ML tasks. System settings are dynamically governed via PostgreSQL:

#table(
  columns: (1.5fr, 1.2fr, 2fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else if calc.even(row) { rgb("#f8fafc") } else { none },
  align: (left, center, left),
  table.header(
    [*Operation / Resource*],
    [*Token Cost*],
    [*Operational Justification*]
  ),
  [User Initial Grant], [50 Free Credits], [Default allowance allocated upon GitHub OAuth self-registration.],
  [Audio Processing], [10 Tokens / Minute], [Ceiling rounded duration: $ceil(max(t, 60) / 60) times 10$. Covers VAD, Diarization, and Whisper ASR.],
  [ChromaDB Vectorization], [Included], [Automatically vectorized into project-partitioned collection.],
  [Conversational RAG Query], [Included], [Unlimited multi-turn interrogations via local Ollama LLM.],
  [Storage Retention], [Included], [Cloudinary CDN audio hosting and PostgreSQL transcript storage.]
)

The credit ledger is immutable; every transaction is stored in `credit_transactions` with `user_id`, `amount`, `balance_after`, and `job_id` references, preventing race conditions or phantom balances.
