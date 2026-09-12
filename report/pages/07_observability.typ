#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= Full-Stack Observability, Promtail & Log Isolation

== Enterprise Observability Architecture

To guarantee predictable service-level objectives (SLOs) and rapid root-cause analysis, SpeakTrace operates a 4-tier telemetry pipeline:

#align(center)[
  #block(
    width: 100%,
    fill: rgb("#f8fafc"),
    stroke: 0.6pt + rgb("#cbd5e1"),
    radius: 6pt,
    inset: (x: 12pt, y: 10pt),
    [
      #text(weight: "bold", size: 9pt, fill: secondary-color, font: "SF Mono")[ENTERPRISE TELEMETRY PIPELINE]
      #v(6pt)
      #grid(
        columns: (1fr, auto, 1fr),
        gutter: 6pt,
        align: horizon + center,
        block(fill: rgb("#eff6ff"), stroke: 0.5pt + rgb("#bfdbfe"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: rgb("#1e40af"))[Express API (:8989)] \
          #text(size: 7pt, fill: rgb("#64748b"), font: "SF Mono")[/app_logs/api/combined.log]
        ],
        text(size: 8pt, fill: rgb("#64748b"))[#sym.arrow.r],
        block(fill: rgb("#f0fdf4"), stroke: 0.5pt + rgb("#bbf7d0"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: rgb("#166534"))[Python ML Worker (:8000)] \
          #text(size: 7pt, fill: rgb("#64748b"), font: "SF Mono")[/app_logs/ml/ml.log]
        ],
      )
      #v(6pt)
      #align(center)[
        #block(fill: rgb("#fef3c7"), stroke: 0.5pt + rgb("#fde68a"), inset: 5pt, radius: 4pt, width: 60%)[
          #text(weight: "bold", size: 8pt, fill: rgb("#92400e"))[Promtail Log Scraper] #text(size: 7pt, fill: rgb("#78350f"))[(ships to Loki :3100)]
        ]
      ]
      #v(6pt)
      #line(length: 100%, stroke: 0.4pt + rgb("#e2e8f0"))
      #v(4pt)
      #grid(
        columns: (1fr, 1fr),
        gutter: 8pt,
        align: left,
        block(fill: rgb("#f1f5f9"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: primary-color)[Panel 7: App Logs] \
          #text(size: 7pt, fill: rgb("#64748b"), font: "SF Mono")[{container=~"speaktrace-(api|ml)"}]
        ],
        block(fill: rgb("#f1f5f9"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: primary-color)[Panel 8: Telemetry Logs] \
          #text(size: 7pt, fill: rgb("#64748b"), font: "SF Mono")[{container=~"speaktrace-(prom|loki)"}]
        ],
      )
    ]
  )
]


== Structured JSON File Logging & Promtail Scraper

Rather than relying on Docker stdout which mixes container engine metadata, SpeakTrace writes structured JSON directly to mounted volumes:

```python
# ml/src/logger.py
import logging
from pythonjsonlogger import jsonlogger

log_handler = logging.FileHandler("/app_logs/ml/ml.log")
formatter = jsonlogger.JsonFormatter(
    "%(asctime)s %(levelname)s %(name)s "
    "%(message)s %(job_id)s %(tenant_id)s"
)

log_handler.setFormatter(formatter)
logger.addHandler(log_handler)
```

Promtail ingests these logs and dynamically attaches container identifiers:

```yaml
# docker/promtail/promtail-config.yml
scrape_configs:
  - job_name: speaktrace-logs
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

== Strict Log Segregation in Grafana

A critical engineering enhancement implemented in the dashboard was the total isolation of noisy telemetry containers from core application logs:

#table(
  columns: (1.5fr, 1.8fr, 2fr),
  stroke: 0.5pt + rgb("#cbd5e1"),
  fill: (col, row) => if row == 0 { rgb("#f1f5f9") } else if calc.even(row) { rgb("#f8fafc") } else { none },
  align: (left, left, left),
  table.header(
    [*Dashboard Panel*],
    [*Loki LogQL Query*],
    [*Operational Purpose*]
  ),
  [Main Application Log Aggregator (Panel 7)], [`{container=~"speaktrace-(api|ml)"}`], [Displays structured multiline API and ML logs with job IDs and error traces.],
  [Infrastructure Telemetry Aggregator (Panel 8)], [`{container=~"speaktrace-(prometheus|loki|grafana|promtail)"}`], [Isolates scrape errors, database heartbeats, and Loki ingestion notices at bottom.]
)

== Remediation of Prometheus "No Data" States

During system cold starts, panels measuring histogram stages or error counts frequently rendered blank ("No data") because Prometheus had not yet registered labeled vectors.

SpeakTrace resolves this by pre-initializing all Prometheus metric label pairs upon service startup:

```python
# ml/src/metrics.py
def init_metrics():
    # Pre-register common stage labels to prevent NaN Grafana charts
    for stage in [
        "diarization", "snippet_extraction",
        "transcription", "rag_indexing"
    ]:
        PROCESSING_DURATION_SECONDS.labels(stage=stage).observe(0.0)

    
    for status in ["success", "failure"]:
        JOBS_PROCESSED_TOTAL.labels(status=status).inc(0)
```

In Grafana dashboard queries, fallback vectors (`or vector(0)`) ensure all gauges, stage latency graphs, and throughput counters display crisp zeros instead of empty warnings.
