import os
from pydub import AudioSegment
from pydub.silence import split_on_silence, detect_nonsilent
from src.config import settings
from src.logger import logger


def run_diarization(audio_wav_path: str) -> list[dict]:
    """
    Performs speaker diarization on a normalized 16kHz mono WAV file.
    Returns a list of segments with speaker labels, start times, and end times in seconds:
    [
        {"speaker": "SPEAKER_00", "start": 0.0, "end": 3.8},
        {"speaker": "SPEAKER_01", "start": 4.1, "end": 7.5},
        ...
    ]
    """
    # 1. Check if pyannote can be loaded with HF_TOKEN
    if settings.hf_token:
        try:
            from pyannote.audio import Pipeline
            logger.info("Initializing pyannote.audio diarization pipeline with HF_TOKEN")
            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=settings.hf_token,
            )
            diarization = pipeline(audio_wav_path)
            segments = []
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                segments.append({
                    "speaker": speaker,
                    "start": round(turn.start, 2),
                    "end": round(turn.end, 2),
                })
            logger.info("Pyannote diarization complete", segments_count=len(segments))
            if segments:
                return segments
        except Exception as e:
            logger.warn("Pyannote pipeline failed or unavailable, falling back to heuristic segmenter", error=str(e))

    # 2. Heuristic Voice Activity Diarization Fallback
    logger.info("Running robust voice activity diarization fallback")
    sound = AudioSegment.from_wav(audio_wav_path)
    total_sec = len(sound) / 1000.0

    # Detect non-silent speech chunks (min silence 400ms, silence thresh -36dBFS)
    nonsilent_ranges = detect_nonsilent(sound, min_silence_len=400, silence_thresh=-36)

    if not nonsilent_ranges:
        # Fallback single speaker entire clip
        return [{"speaker": "SPEAKER_00", "start": 0.0, "end": round(total_sec, 2)}]

    segments = []
    # Alternate between SPEAKER_00 and SPEAKER_01 if turns change, or assign speakers
    current_speaker_idx = 0
    num_speakers = 2  # default 2 speakers in a conversation

    for i, (start_ms, end_ms) in enumerate(nonsilent_ranges):
        start_sec = round(start_ms / 1000.0, 2)
        end_sec = round(end_ms / 1000.0, 2)

        # Toggle speaker if gap between chunks is > 0.8 seconds
        if i > 0:
            prev_end_ms = nonsilent_ranges[i - 1][1]
            gap_sec = (start_ms - prev_end_ms) / 1000.0
            if gap_sec > 0.6:
                current_speaker_idx = (current_speaker_idx + 1) % num_speakers

        speaker_tag = f"SPEAKER_{current_speaker_idx:02d}"
        segments.append({
            "speaker": speaker_tag,
            "start": start_sec,
            "end": end_sec,
        })

    logger.info("Heuristic diarization complete", segments_count=len(segments))
    return segments
