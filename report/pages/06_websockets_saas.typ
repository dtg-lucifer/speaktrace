#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= Real-Time WebSockets, SaaS Billing & Visualizer

== Replacing Polling with Bidirectional WebSockets

In early iterations, the dashboard queried `GET /api/v1/uploads/jobs/:id` every $2$ seconds to monitor processing stages. Under multi-user load, this triggered rate-limiting errors (`429 Too Many Requests`), CORS header collisions, and CPU waste.

SpeakTrace replaced client-side polling with a high-throughput *Socket.io* WebSocket layer integrated with *Redis Pub/Sub*:

#align(center)[
  #block(
    width: 100%,
    fill: rgb("#f8fafc"),
    stroke: 0.6pt + rgb("#cbd5e1"),
    radius: 6pt,
    inset: (x: 12pt, y: 10pt),
    [
      #text(weight: "bold", size: 9pt, fill: secondary-color, font: "SF Mono")[REAL-TIME WEBSOCKET ARCHITECTURE]
      #v(6pt)
      #grid(
        columns: (1fr, auto, 1.2fr, auto, 1fr),
        align: horizon + center,
        gutter: 4pt,
        block(fill: rgb("#eff6ff"), stroke: 0.5pt + rgb("#bfdbfe"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: rgb("#1e40af"))[Next.js Client] \
          #text(size: 7pt, fill: rgb("#64748b"))[User Dashboard]
        ],
        text(size: 8pt, fill: rgb("#64748b"))[#sym.arrow.l.r],
        block(fill: rgb("#f0fdf4"), stroke: 0.5pt + rgb("#bbf7d0"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: rgb("#166534"))[Express API (:8989)] \
          #text(size: 7pt, fill: rgb("#64748b"))[Socket.io Room Hub]
        ],
        text(size: 8pt, fill: rgb("#64748b"))[#sym.arrow.l.r],
        block(fill: rgb("#fef2f2"), stroke: 0.5pt + rgb("#fecaca"), inset: 6pt, radius: 4pt)[
          #text(weight: "bold", size: 8pt, fill: rgb("#991b1b"))[Redis 7 + ML] \
          #text(size: 7pt, fill: rgb("#64748b"))[Pub/Sub Pipeline]
        ],
      )
      #v(8pt)
      #line(length: 100%, stroke: 0.4pt + rgb("#e2e8f0"))
      #v(4pt)
      #grid(
        columns: (1fr, 1fr, 1fr),
        gutter: 6pt,
        align: left,
        [#text(size: 7.5pt, fill: rgb("#047857"), font: "SF Mono")[#sym.triangle.stroked.r Live Progress % & Stage]],
        [#text(size: 7.5pt, fill: rgb("#047857"), font: "SF Mono")[#sym.triangle.stroked.r Speaker Prompt Ready]],
        [#text(size: 7.5pt, fill: rgb("#047857"), font: "SF Mono")[#sym.triangle.stroked.r Live Navbar Credit Sync]],
      )
    ]
  )
]


=== Event Dispatch Pipeline
1. *Project Room Subscriptions*: Upon opening a project, the client emits `join_project(projectId)`. All job updates for that project are broadcast exclusively to active collaborators in that room.
2. *Redis Pub/Sub Integration*: When the Python ML worker updates job state or completes transcription, it publishes to Redis. The Express API consumes the event and instantly forwards it to the associated Socket.io room:

```typescript
// api/src/lib/socket.ts
export function initSocketServer(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("join_project", (projectId: string) => {
      socket.join(`project:${projectId}`);
    });
  });

  // Subscribe to Redis event notifications
  redisSub.subscribe("job.progress.updated", (message) => {
    const data = JSON.parse(message);
    io.to(`project:${data.project_id}`)
      .emit("job.progress.updated", data);
  });
}
```

== Immutable Credit Ledger & Live Synchronization

To guarantee financial integrity across billable compute runs, user balances are debited atomically inside PostgreSQL transactions:

```sql
-- Atomic debit preventing balance underflow
UPDATE users
SET credits = credits - $1, updated_at = NOW()
WHERE id = $2 AND credits >= $1
RETURNING credits;

-- Ledger record for historical auditability
INSERT INTO credit_transactions (
    user_id, amount, balance_after, type, description, job_id
) VALUES ($1, -$2, $3, 'job_processing', 'Whisper ASR Debit', $4);
```

=== Frontend Real-Time Credit Sync
Whenever a processing stage concludes or new credits are allocated, the API broadcasts `speaktrace_user_updated`. The dashboard's `refreshCurrentUser()` hook automatically updates user token balances without requiring page reloads.

== HTML5 Canvas Sound Spectrum Visualizer & File Renaming

To provide a modern, sensory audio experience, SpeakTrace includes a native HTML5 Canvas sound wave visualizer:

- *48 Frequency Bars*: Computed using oscillating sinusoids driven by playback timestamps.
- *Peaceful Mint Theming*: Rendered using `--acid` (`#22c55e` / `#4ade80`) tokens matching WCAG AAA readability standards.
- *Persistent File Renaming*: Users can update audio filenames directly from the audio tab, writing to PostgreSQL via `PATCH /uploads/jobs/:jobId/rename`:

```typescript
// api/src/modules/uploads/uploads.repository.ts
async renameMediaAssetByJobId(
  jobId: string,
  newFilename: string,
  userId: string
): Promise<boolean> {
  const res = await this.db.query(
    `UPDATE media_assets
     SET original_filename = $1, updated_at = NOW()
     WHERE id = (
       SELECT media_asset_id FROM processing_jobs WHERE id = $2
     )
     AND uploaded_by = $3`,
    [newFilename, jobId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
```

