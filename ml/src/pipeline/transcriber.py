from src.config import settings
from src.logger import logger


def transcribe_and_align(
    audio_wav_path: str,
    diarized_segments: list[dict],
    speaker_mappings: dict[str, str] | None = None,
) -> list[dict]:
    """
    Transcribes audio segments and maps timestamps to speakers and user-assigned names.
    Returns:
    [
        {
            "speaker": "Piush",
            "start": 0.0,
            "end": 3.8,
            "text": "Hey, welcome to this interview.",
            "emotion": "friendly"
        },
        ...
    ]
    """
    mappings = speaker_mappings or {}
    aligned_results = []

    # 1. Real transcription using faster-whisper
    transcribed_segments = []
    try:
        from faster_whisper import WhisperModel
        logger.info("Running faster-whisper transcription", model_size=settings.whisper_model_size, audio_path=audio_wav_path)
        model = WhisperModel(settings.whisper_model_size, device="cpu", compute_type="int8")
        segments_gen, info = model.transcribe(audio_wav_path, beam_size=5, vad_filter=True)
        for seg in segments_gen:
            clean_text = seg.text.strip()
            if clean_text:
                transcribed_segments.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": clean_text,
                })
        logger.info("Faster-whisper transcription completed successfully", segments_count=len(transcribed_segments))
    except Exception as e:
        logger.error("Faster-whisper transcription failed", error=str(e))
        raise RuntimeError(f"Speech transcription failed: {e}")

    # 2. Align transcription text with diarized speaker intervals using maximum temporal overlap
    for t_seg in transcribed_segments:
        best_overlap = 0.0
        best_spk = None

        # Find diarization segment that overlaps the most with this transcription segment
        for d_seg in diarized_segments:
            overlap = max(0.0, min(t_seg["end"], d_seg["end"]) - max(t_seg["start"], d_seg["start"]))
            if overlap > best_overlap:
                best_overlap = overlap
                best_spk = d_seg["speaker"]

        # If no strict overlap (e.g. between boundaries), pick closest segment center
        if not best_spk and diarized_segments:
            t_mid = (t_seg["start"] + t_seg["end"]) / 2.0
            min_dist = float("inf")
            for d_seg in diarized_segments:
                d_mid = (d_seg["start"] + d_seg["end"]) / 2.0
                dist = abs(t_mid - d_mid)
                if dist < min_dist:
                    min_dist = dist
                    best_spk = d_seg["speaker"]

        matched_speaker_tag = best_spk or "SPEAKER_00"

        # Map to user assigned name if provided (e.g. SPEAKER_00 -> "Philomena Cunk")
        final_speaker_name = mappings.get(matched_speaker_tag, matched_speaker_tag)

        aligned_results.append({
            "speaker": final_speaker_name,
            "speaker_tag": matched_speaker_tag,
            "start": t_seg["start"],
            "end": t_seg["end"],
            "text": t_seg["text"],
            "emotion": "neutral",
        })

    logger.info("Aligned transcription and speaker names", total_segments=len(aligned_results))
    return aligned_results
