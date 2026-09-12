from prometheus_client import Counter, Histogram

JOBS_PROCESSED_TOTAL = Counter(
    "speaktrace_ml_jobs_processed_total",
    "Total audio processing jobs completed by ML worker",
    ["status"],
)

PROCESSING_DURATION_SECONDS = Histogram(
    "speaktrace_processing_duration_seconds",
    "Duration of audio processing pipeline stages in seconds",
    ["stage"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600],
)

SPEAKERS_DETECTED_TOTAL = Counter(
    "speaktrace_speakers_detected_total",
    "Total speaker identities diarized",
)

RAG_QUERIES_TOTAL = Counter(
    "speaktrace_rag_queries_total",
    "Total conversational queries handled by LangChain/LangGraph RAG engine",
)

# Initialize labeled metrics so Prometheus receives series immediately
def init_metrics():
    JOBS_PROCESSED_TOTAL.labels(status="success")
    JOBS_PROCESSED_TOTAL.labels(status="failure")
    PROCESSING_DURATION_SECONDS.labels(stage="diarization")
    PROCESSING_DURATION_SECONDS.labels(stage="transcription")
    PROCESSING_DURATION_SECONDS.labels(stage="rag_indexing")
    SPEAKERS_DETECTED_TOTAL.inc(0)
    RAG_QUERIES_TOTAL.inc(0)

init_metrics()
