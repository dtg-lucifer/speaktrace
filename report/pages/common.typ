// SpeakTrace Technical Report - Common Styling & Components
#let primary-color = rgb("#0f392b")     // Deep Forest Emerald
#let secondary-color = rgb("#047857")   // Vibrant Emerald Accent
#let accent-brand = rgb("#10b981")      // Mint Green
#let text-dark = rgb("#0f172a")         // Slate 900
#let text-muted = rgb("#64748b")        // Slate 500

#let bg-callout = rgb("#f0fdf4")        // Soft Mint / Pastel Green
#let border-callout = rgb("#16a34a")    // Vibrant Green Border
#let bg-note = rgb("#eff6ff")           // Soft Sky Blue
#let border-note = rgb("#2563eb")       // Vivid Blue Border
#let bg-tech = rgb("#f8fafc")           // Subtle Slate
#let border-tech = rgb("#64748b")       // Slate Border

// Callout Box Component for Architectural Notes
#let callout(title: "Concept Note", label: "ARCHITECTURAL NOTE", body) = {
  rect(
    width: 100%,
    radius: 4pt,
    fill: bg-note,
    stroke: (left: 3.5pt + border-note, rest: 0.5pt + rgb("#cbd5e1")),
    inset: (x: 14pt, y: 11pt),
    outset: 0pt,
  )[
    #text(size: 8pt, weight: "bold", fill: border-note, font: "SF Mono", tracking: 1.5pt)[#label]
    #v(2pt)
    #text(weight: "bold", fill: primary-color, size: 1.05em)[#title]
    #v(4pt)
    #text(fill: text-dark, size: 0.95em, style: "normal")[#body]
  ]
}

// Technical Highlight / Key Takeaway Box
#let takeaway(title: "Key Engineering Takeaway", label: "KEY TAKEAWAY", body) = {
  rect(
    width: 100%,
    radius: 4pt,
    fill: bg-callout,
    stroke: (left: 3.5pt + border-callout, rest: 0.5pt + rgb("#bbf7d0")),
    inset: (x: 14pt, y: 11pt),
    outset: 0pt,
  )[
    #text(size: 8pt, weight: "bold", fill: border-callout, font: "SF Mono", tracking: 1.5pt)[#label]
    #v(2pt)
    #text(weight: "bold", fill: rgb("#14532d"), size: 1.05em)[#title]
    #v(4pt)
    #text(fill: rgb("#064e3b"), size: 0.95em)[#body]
  ]
}

// Challenge & Resolution Box
#let challenge-box(challenge: "", problem: "", solution: "") = {
  rect(
    width: 100%,
    radius: 4pt,
    fill: rgb("#fff7ed"),
    stroke: (left: 3.5pt + rgb("#ea580c"), rest: 0.5pt + rgb("#fed7aa")),
    inset: (x: 14pt, y: 11pt),
  )[
    #text(size: 8pt, weight: "bold", fill: rgb("#c2410c"), font: "SF Mono", tracking: 1.5pt)[ENGINEERING CHALLENGE & RESOLUTION]

    #v(2pt)
    #text(weight: "bold", fill: rgb("#9a3412"), size: 1.05em)[#challenge]
    #v(5pt)
    #text(weight: "bold", fill: rgb("#7c2d12"))[The Operational Bottleneck:] #text(fill: rgb("#431407"))[#problem]
    #v(5pt)
    #text(weight: "bold", fill: rgb("#166534"))[Engineering Implementation:] #text(fill: rgb("#14532d"))[#solution]
  ]
}
