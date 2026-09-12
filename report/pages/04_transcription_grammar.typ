#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= Whisper Transcription, Speaker Alignment & Custom Grammar

== Faster-Whisper Speech Recognition & Midpoint Alignment

Once the user submits speaker names, the Python ML worker resumes audio transcription using `faster-whisper`. Whisper operates with beam size $5$ and $8$-bit integer quantization (`compute_type="int8"`), achieving an optimal speed-to-accuracy trade-off on standard hardware.

=== Midpoint Temporal Matching
Because Whisper segments do not necessarily share exact start and end timestamps with acoustic diarization boundaries, SpeakTrace aligns each ASR segment using its temporal midpoint $t_"midpoint"$:

$ t_"midpoint" = (t_"start" + t_"end") / 2 $

The assigned speaker identity is mapped to the corresponding diarization interval:

$ "FinalSpeaker"(t_"midpoint") = cal(M)({ S_k mid(|) t_"start"^((k)) <= t_"midpoint" <= t_"end"^((k)) }) $


```python
# ml/src/pipeline/transcriber.py
def transcribe_and_align(
    audio_wav_path: str,
    diarized_segments: list[dict],
    mappings: dict[str, str]
) -> list[dict]:
    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments_gen, _ = model.transcribe(audio_wav_path, beam_size=5)

    aligned = []
    for t_seg in segments_gen:
        t_mid = (t_seg.start + t_seg.end) / 2.0
        # Resolve speaker cluster containing segment midpoint
        matched_tag = next(
            (d["speaker"] for d in diarized_segments
             if d["start"] <= t_mid <= d["end"]),
            "SPEAKER_00",
        )
        # Substitute verified name (SPEAKER_00 -> "Sarah")
        final_name = mappings.get(matched_tag, matched_tag)

        aligned.append({
            "speaker": final_name,
            "start": round(t_seg.start, 2),
            "end": round(t_seg.end, 2),
            "text": t_seg.text.strip(),
        })
    return aligned
```

== Dynamic Grammar & Template Formatting Engine

Transcripts must often be fed into disparate third-party systems. SpeakTrace implements a dynamic formatting engine supporting WebVTT, plain text, and arbitrary user-defined templates:

=== 1. WebVTT Subtitle Standard (`.vtt`)
```vtt
WEBVTT

1
00:01:14.000 --> 00:01:21.000
<v Sarah (Host)>David, how did the transition
to distributed queues affect your API responsiveness?</v>

2
00:01:22.000 --> 00:01:30.000
<v David (Founder)>Yes, we saw a 40% reduction in database latency,
and background processing no longer blocks HTTP workers.</v>
```


=== 2. Custom Grammar Templates
Users can supply grammar templates utilizing variable placeholders:
```python
# ml/src/pipeline/formatter.py
def render_custom_template(
    segments: list[dict], template: str
) -> str:
    rendered_blocks = []
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
        rendered_blocks.append(block)
    return "\n".join(rendered_blocks)
```

== Landing Page Design Alignment in Transcript Viewer

To guarantee complete visual fidelity between product marketing and the live dashboard, the `TranscriptViewer.tsx` component renders cues in the exact layout showcased on the SpeakTrace landing page:

#align(center)[
  #block(
    width: 100%,
    fill: rgb("#f8fafc"),
    stroke: 0.6pt + rgb("#cbd5e1"),
    radius: 6pt,
    inset: (x: 14pt, y: 12pt),
    [
      #grid(
        columns: (auto, 1fr, auto),
        gutter: 8pt,
        align: (left, left, right),
        box(fill: rgb("#dcfce7"), inset: (x: 5pt, y: 2pt), radius: 3pt)[#text(size: 8pt, fill: rgb("#15803d"), font: "SF Mono", weight: "bold")[00:01:14]],
        text(weight: "bold", fill: rgb("#15803d"), size: 9pt)[Sarah (Host):],
        text(fill: rgb("#94a3b8"), font: "SF Mono", size: 8pt, weight: "bold")[\#01],
      )
      #v(3pt)
      #block(stroke: (left: 2.5pt + rgb("#22c55e")), inset: (left: 9pt, y: 2pt))[
        #text(size: 9pt, fill: rgb("#1e293b"))[David, how did the transition to distributed queues affect your API responsiveness?]
      ]
      #v(10pt)
      #grid(
        columns: (auto, 1fr, auto),
        gutter: 8pt,
        align: (left, left, right),
        box(fill: rgb("#dcfce7"), inset: (x: 5pt, y: 2pt), radius: 3pt)[#text(size: 8pt, fill: rgb("#15803d"), font: "SF Mono", weight: "bold")[00:01:22]],
        text(weight: "bold", fill: rgb("#15803d"), size: 9pt)[David (Founder):],
        text(fill: rgb("#94a3b8"), font: "SF Mono", size: 8pt, weight: "bold")[\#02],
      )
      #v(3pt)
      #block(stroke: (left: 2.5pt + rgb("#22c55e")), inset: (left: 9pt, y: 2pt))[
        #text(size: 9pt, fill: rgb("#1e293b"))[Yes, we saw a 40% reduction in database latency, and our background processing no longer blocks HTTP workers.]
      ]
    ]
  )
]


1. *Timestamp Pill First*: A high-contrast emerald pill (`00:01:14`) formatted in `HH:MM:SS`. Clicking the pill jumps audio playback directly to that cue.
2. *Speaker Name Second*: A bold, colored label (`Sarah (Host):`) providing clear conversational attribution.
3. *Dialogue Speech Text*: Clean dialogue text indented with a vertical green border (`border-l-2 border-emerald-500/35 pl-3`).
4. *Sequence Number Badge*: A mono-spaced sequence tag (`#01`, `#02`) anchored at the far right of the cue header.
