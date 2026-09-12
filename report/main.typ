#import "pages/common.typ": primary-color, secondary-color, accent-brand, text-dark, text-muted, bg-tech, border-tech

// Document Metadata
#set document(
  title: "SpeakTrace: Technical Engineering Report",
  author: ("SpeakTrace Engineering Team", "Piush"),
  date: auto,
)

// Page Configuration (A4 with professional margins and dynamic headers/footers)
#set page(
  paper: "a4",
  margin: (top: 2.6cm, bottom: 2.6cm, left: 2.5cm, right: 2.5cm),
  header: context {
    if here().page() > 1 [
      #grid(
        columns: (1fr, auto),
        align(left)[#text(size: 8.5pt, fill: rgb("#64748b"), font: "Liberation Serif")[*SpeakTrace* — Speech Intelligence, Diarization & Conversational RAG Architecture]],
        align(right)[#text(size: 8.5pt, fill: rgb("#64748b"), font: "Liberation Serif")[Technical Systems Report]]
      )
      #v(-3pt)
      #line(length: 100%, stroke: 0.4pt + rgb("#cbd5e1"))
    ]
  },
  footer: context {
    if here().page() > 1 [
      #line(length: 100%, stroke: 0.4pt + rgb("#cbd5e1"))
      #v(2pt)
      #grid(
        columns: (1fr, auto),
        align(left)[#text(size: 8.5pt, fill: rgb("#94a3b8"), font: "Liberation Serif")[Confidential & Proprietary — SpeakTrace Project]],
        align(right)[#text(size: 8.5pt, fill: rgb("#047857"), font: "SF Mono", weight: "bold")[Page #here().page()]]
      )
    ]

  }
)

// Document Typography (Times New Roman / Liberation Serif)
#set text(
  font: ("Liberation Serif", "Nimbus Roman", "DejaVu Serif"),
  size: 10.5pt,
  fill: text-dark,
  lang: "en",
)

#set par(
  justify: true,
  leading: 0.72em,
)

// Heading Styling
#show heading: it => {
  set text(fill: primary-color, font: ("Liberation Serif", "Nimbus Roman", "DejaVu Serif"))
  if it.level == 1 {
    v(1.4em)
    text(size: 1.6em, weight: "bold")[#it.body]
    v(0.6em)
  } else if it.level == 2 {
    v(1.1em)
    text(size: 1.25em, weight: "bold", fill: secondary-color)[#it.body]
    v(0.4em)
  } else if it.level == 3 {
    v(0.8em)
    text(size: 1.05em, weight: "bold", fill: rgb("#065f46"))[#it.body]
    v(0.3em)
  } else {
    v(0.6em)
    text(size: 1.0em, weight: "bold")[#it.body]
    v(0.2em)
  }
}

#set heading(numbering: "1.1")

// Code & Raw Block Typography (SF Mono)
#show raw: set text(font: "SF Mono", size: 8pt)

// Inline Code Styling
#show raw.where(block: false): box.with(
  fill: rgb("#f1f5f9"),
  stroke: 0.4pt + rgb("#cbd5e1"),
  radius: 3pt,
  inset: (x: 3.5pt, y: 0pt),
  outset: (y: 2.5pt),
)

// Block Code Styling with Line Numbers and Elegant Border
#show raw.where(block: true): it => block(
  fill: rgb("#f8fafc"),
  stroke: (left: 3pt + secondary-color, rest: 0.6pt + rgb("#cbd5e1")),
  radius: (right: 4pt, left: 0pt),
  inset: (x: 8pt, y: 7pt),
  width: 100%,
  if it.lines.len() == 0 [ ] else {
    grid(
      columns: (auto, 1fr),
      column-gutter: 8pt,
      row-gutter: 3pt,
      ..it.lines.map(line => (
        align(right, text(fill: rgb("#94a3b8"), font: "SF Mono", size: 7pt, str(line.number))),
        line
      )).flatten()
    )
  }
)

// --- COVER PAGE ---
#align(center + horizon)[
  #block(
    fill: rgb("#f8fafc"),
    stroke: 1.5pt + primary-color,
    radius: 12pt,
    inset: (x: 28pt, y: 36pt),
    width: 100%,
    [
      #text(size: 11pt, tracking: 2.5pt, weight: "bold", fill: secondary-color, font: "SF Mono")[ENTERPRISE SPEECH INTELLIGENCE & CONVERSATIONAL RAG]
      
      #v(8pt)
      #line(length: 40%, stroke: 1.5pt + secondary-color)
      #v(14pt)

      #text(size: 34pt, weight: "bold", fill: primary-color)[SpeakTrace]
      
      #v(8pt)
      #text(size: 15pt, weight: "medium", fill: rgb("#334155"))[
        End-to-End Audio Ingestion, PyTorch Diarization, Voice Snippet Identification, Dynamic Grammar Transcription & Project-Scoped Vector RAG
      ]

      #v(18pt)
      #block(
        fill: rgb("#f0fdf4"),
        stroke: 0.8pt + rgb("#bbf7d0"),
        radius: 6pt,
        inset: 12pt,
        width: 92%,
        [
          #text(size: 10pt, style: "italic", fill: rgb("#14532d"))[
            A Comprehensive Architectural Specification & Engineering Report on Acoustic Turn Clustering, Voice Snippet Isolation, Document-to-Embedding Geometry in ChromaDB, Streaming Local LLM Synthesis, and Enterprise Observability.
          ]
        ]
      )

      #v(28pt)
      #grid(
        columns: (1fr, 1fr),
        align: (center, center),
        [
          #text(size: 9.5pt, fill: rgb("#64748b"))[Engineering Architecture] \
          #text(size: 11pt, weight: "bold", fill: primary-color)[SpeakTrace Systems Core]
        ],
        [
          #text(size: 9.5pt, fill: rgb("#64748b"))[Report Classification] \
          #text(size: 11pt, weight: "bold", fill: primary-color)[Production Systems Specification]
        ]
      )

      #v(20pt)
      #text(size: 9pt, fill: rgb("#94a3b8"), font: "SF Mono")[Date: September 2026 | Version: 2.4.0-Production]
    ]
  )
]

#pagebreak()


// --- TABLE OF CONTENTS ---
#v(1cm)
#text(size: 1.8em, weight: "bold", fill: primary-color)[Table of Contents]
#v(0.5em)
#line(length: 100%, stroke: 1pt + secondary-color)
#v(1em)

#outline(
  title: none,
  indent: auto,
  depth: 3,
)

#pagebreak()

// --- REPORT CONTENT SECTIONS ---
#include "pages/01_executive_summary.typ"
#pagebreak()

#include "pages/02_system_architecture.typ"
#pagebreak()

#include "pages/03_audio_diarization.typ"
#pagebreak()

#include "pages/04_transcription_grammar.typ"
#pagebreak()

#include "pages/05_rag_vector_engine.typ"
#pagebreak()

#include "pages/06_websockets_saas.typ"
#pagebreak()

#include "pages/07_observability.typ"
#pagebreak()

#include "pages/08_conclusion.typ"
