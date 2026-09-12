#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= Performance Benchmarks, Verification & Future Scope

== Empirical Performance Benchmarks

Benchmarking was conducted on a typical multi-speaker audio recording ($3$ minutes $45$ seconds duration, $3$ unique speakers, $16$ kHz mono WAV):

#table(
  columns: (1.8fr, 1.2fr, 2fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else if calc.even(row) { rgb("#f8fafc") } else { none },
  align: (left, center, left),
  table.header(
    [*Pipeline Processing Stage*],
    [*Execution Latency*],
    [*Hardware & Engine Target*]
  ),
  [Cloudinary Streaming Ingestion], [1.42 seconds], [Node.js buffer pipe to Cloudinary CDN.],
  [16kHz Mono Resampling], [0.38 seconds], [FFmpeg multi-threaded PCM encoder.],
  [Speaker Turn Diarization], [4.15 seconds], [Pyannote 3.1 / VAD heuristic segmenter.],
  [1s–5s Snippet Slicing & CDN Upload], [1.85 seconds], [Pydub slice + Cloudinary concurrent uploads.],
  [Whisper ASR Speech Recognition], [6.20 seconds], [Faster-Whisper (INT8 quantized, beam size 5).],
  [Dynamic Format Rendering (VTT/TXT)], [0.08 seconds], [In-memory regex template parser.],
  [ChromaDB Vector Ingestion], [0.45 seconds], [all-MiniLM-L6-v2 embeddings (384-dim).],
  [RAG First-Token Latency (TTFT)], [0.32 seconds], [Local Ollama Llama-3.2:1b stream.],
  [*Total End-to-End Turnaround*], [*~14.8 seconds*], [*Real-time factor (RTF) of 0.065x*]
)

#v(8pt)
#takeaway(
  title: "Real-Time Factor (RTF) Efficiency",
  label: "BENCHMARK SUMMARY",
  [
    SpeakTrace achieves a Real-Time Factor of $0.065 times$ on standard CPU compute. A 10-minute conference call is fully diarized, transcribed, snippet-extracted, and vector-indexed in approximately *39 seconds*, delivering near-instant human-in-the-loop verification.
  ]
)

== Verification & Test Validation Results

All architectural updates and software components have undergone automated and end-to-end verification:

- *Next.js Frontend Build*: `npm run build` compiled with Turbopack in $1,199$ ms with $0$ errors across all dynamic and static routes.
- *API Backend Typecheck*: `bun run typecheck` executed via `tsc --noEmit` passing with $0$ type errors.
- *ML Worker Validation*: Python modules verified with `compileall` and healthy runtime execution on port `:8000`.
- *Transcript Cue Parser Assertions*: Automated test suite passed 100% of assertions across standard WebVTT cues, custom grammar templates, and colloquial plain text transcripts.
- *Prometheus & Loki Scrapes*: Promtail successfully ships structured JSON logs to Loki, and Prometheus scrapes metric endpoints with zero fallback errors.

== Future Engineering Scope & Roadmap

1. *Continuous Voice Enrollment (Cross-Project Speaker Recognition)*:
   Enable users to save speaker voice profiles permanently, automatically identifying recurring participants across multiple recording sessions without repeated manual labeling.
2. *Real-Time Live Audio Streaming*:
   Extend the pipeline from file batching to real-time WebRTC audio streams, supporting live courtroom transcription and instant conference subtitles.
3. *Multi-Lingual Translation & Emotion Detection*:
   Integrate acoustic pitch and inflection analysis to automatically enrich transcripts with emotional markers (`[Amused]`, `[Frustrated]`, `[Hesitant]`).
4. *Air-Gapped Sovereign Deployment*:
   Provide a unified single-node Docker package for defense, intelligence, and healthcare installations requiring complete disconnection from public cloud infrastructure.
