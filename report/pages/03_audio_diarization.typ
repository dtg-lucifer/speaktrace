#import "common.typ": primary-color, secondary-color, accent-brand, callout, takeaway, challenge-box

= Audio Preprocessing, Diarization & Voice Snippet Extraction

== Audio Ingestion & Standardized Normalization

Raw user uploads arrive across various container formats (MP3, WAV, M4A, FLAC, MP4, OGG) with divergent sample rates (44.1 kHz, 48 kHz), bit depths, and stereo channels. To maintain consistent acoustic representations across deep learning models, SpeakTrace immediately standardizes incoming audio streams:

1. *Stream Decoding & Normalization*: Ingested buffers are decoded via FFmpeg and normalized to single-channel (mono) 16-bit PCM at exactly *16,000 Hz* ($16$ kHz).
2. *Dynamic Range Peak Leveling*: Spoken volume is leveled to prevent clipping or muted speech segments from degrading downstream spectral cluster distances.

```python
# ml/src/pipeline/downloader.py
from pydub import AudioSegment

def normalize_audio(
    raw_media_path: str, output_wav_path: str
) -> None:
    """Converts media into standardized 16kHz mono PCM WAV."""
    audio = AudioSegment.from_file(raw_media_path)
    audio = (
        audio.set_frame_rate(16000)
        .set_channels(1)
        .set_sample_width(2)
    )
    audio.export(output_wav_path, format="wav")
```

== Speaker Diarization Pipeline (Pyannote 3.1 & VAD Fallback)

Speaker diarization seeks to answer the fundamental query: *"Who spoke when?"* SpeakTrace formulates diarization as an optimization problem:

Given an acoustic feature sequence $X = (x_1, x_2, ..., x_T)$ extracted from $16$ kHz audio, partition the timeline into $K$ distinct speaker clusters $S = {S_1, S_2, ..., S_K}$ where each segment $s_(i,j) = [t_"start", t_"end"]$ satisfies:

$ P(S_k mid(|) x_(t_"start" ... t_"end")) > theta_"threshold" $

```python
# ml/src/pipeline/diarizer.py
from pyannote.audio import Pipeline
from pydub.silence import detect_nonsilent

def run_diarization(audio_wav_path: str) -> list[dict]:
    """Extracts speaker turns with start/end timecodes."""
    if settings.hf_token:
        pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=settings.hf_token,
        )
        diarization = pipeline(audio_wav_path)
        return [
            {
                "speaker": spk,
                "start": round(turn.start, 2),
                "end": round(turn.end, 2)
            }
            for turn, _, spk in (
                diarization.itertracks(yield_label=True)
            )
        ]
    
    # Heuristic Voice Activity Detection Fallback
    sound = AudioSegment.from_wav(audio_wav_path)
    nonsilent = detect_nonsilent(
        sound, min_silence_len=400, silence_thresh=-36
    )
    segments = []
    for i, (start_ms, end_ms) in enumerate(nonsilent):
        spk = f"SPEAKER_{i % 2:02d}"  # Alternating turn clustering
        segments.append({
            "speaker": spk,
            "start": round(start_ms / 1000.0, 2),
            "end": round(end_ms / 1000.0, 2),
        })
    return segments
```

== 1s–5s Voice Snippet Slicing Algorithm

Once speaker clusters $cal(S)_k$ are identified, SpeakTrace isolates a single continuous vocal segment of length $1.5"s" <= Delta t <= 5.0"s"$ per speaker. This creates a concise, high-confidence audio snippet used for human verification:

$ "Snippet"(k) = limits(arg max)_(s in cal(S)_k) { min(t_"end" - t_"start", 5.0) mid(|) (t_"end" - t_"start") >= 1.5 } $


```python
# ml/src/pipeline/snippet_extractor.py
def extract_speaker_snippets(
    audio_wav_path: str,
    segments: list[dict],
    job_id: str
) -> list[dict]:
    sound = AudioSegment.from_wav(audio_wav_path)
    grouped = group_by_speaker(segments)
    snippets = []

    for spk_tag, spk_turns in grouped.items():
        # Select turn with longest continuous speech under 5 seconds
        valid_turns = [
            t for t in spk_turns if (t["end"] - t["start"]) >= 1.5
        ]
        best_turn = (
            max(valid_turns, key=lambda x: x["end"] - x["start"])
            if valid_turns else spk_turns[0]
        )

        start_ms = int(best_turn["start"] * 1000)
        end_ms = min(int(best_turn["end"] * 1000), start_ms + 5000)

        # Slice snippet buffer and export
        clip = sound[start_ms:end_ms]
        clip.export(tmp_path, format="mp3", bitrate="128k")

        # Upload snippet to Cloudinary CDN
        pub_id = f"speaktrace/snippets/{job_id}/{spk_tag.lower()}"
        upload_res = cloudinary.uploader.upload(
            tmp_path,
            public_id=pub_id,
            resource_type="video",
            overwrite=True,
        )
        snippets.append({
            "speaker_tag": spk_tag,
            "snippet_url": upload_res["secure_url"],
            "duration_seconds": round(
                (end_ms - start_ms) / 1000.0, 2
            ),
        })
    return snippets
```

== Interactive Speaker Identification UI (Next.js Dashboard)

The backend transitions the job to `AWAITING_SPEAKER_MAPPING` and emits a WebSocket notification. The Next.js dashboard pops open the Speaker Identification Modal:

```tsx
// dashboard/src/components/speakers/SpeakerModal.tsx
<div className="space-y-4">
  {speakers.map((spk) => (
    <div
      key={spk.speaker_tag}
      className="flex items-center gap-3 p-3 rounded-lg border"
    >
      <button
        onClick={() => togglePlaySnippet(spk.speaker_tag)}
        className="w-9 h-9 rounded-full bg-emerald-500 text-white"
      >
        {activePlaying === spk.speaker_tag
          ? <Pause className="w-4 h-4" />
          : <Play className="w-4 h-4" />}
      </button>

      
      <input
        type="text"
        placeholder="Enter speaker name (e.g. Sarah, Host)..."
        value={mappings[spk.speaker_tag] || ""}
        onChange={(e) =>
          updateName(spk.speaker_tag, e.target.value)
        }
        className={
          "flex-1 px-3 py-1.5 rounded-lg border text-xs font-mono"
        }
      />
    </div>
  ))}
</div>

```

Once submitted via `POST /uploads/jobs/:jobId/speakers`, the mappings (`{"SPEAKER_00": "Sarah (Host)", "SPEAKER_01": "David (Founder)"}`) are stored in `job_speakers` and published as `speaker.mapping.submitted`.
