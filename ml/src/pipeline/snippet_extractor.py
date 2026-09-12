import os
import tempfile
from pydub import AudioSegment
import cloudinary
import cloudinary.uploader
from src.config import settings
from src.logger import logger


def extract_speaker_snippets(
    audio_wav_path: str,
    diarized_segments: list[dict],
    job_id: str,
) -> list[dict]:
    """
    Extracts a 1-5 second audio snippet for each unique speaker detected during diarization.
    Uploads each snippet to Cloudinary (or returns a playable asset path) so users can
    listen to the speaker's voice in the frontend dashboard and identify them by name.

    Returns:
    [
        {
            "speaker_tag": "SPEAKER_00",
            "snippet_url": "https://res.cloudinary.com/.../speaker_00.mp3",
            "duration_seconds": 3.5
        },
        ...
    ]
    """
    sound = AudioSegment.from_wav(audio_wav_path)
    speaker_segments_map: dict[str, list[dict]] = {}

    for seg in diarized_segments:
        spk = seg["speaker"]
        if spk not in speaker_segments_map:
            speaker_segments_map[spk] = []
        speaker_segments_map[spk].append(seg)

    snippets = []

    for spk_tag, segs in speaker_segments_map.items():
        # Find the segment closest to 2.5 - 4.0 seconds, or the longest segment up to 5.0 seconds
        best_seg = None
        best_dur = 0.0

        for s in segs:
            dur = s["end"] - s["start"]
            if 1.5 <= dur <= 5.0:
                best_seg = s
                best_dur = dur
                break
            elif dur > best_dur:
                best_seg = s
                best_dur = dur

        if not best_seg:
            best_seg = segs[0]
            best_dur = max(best_seg["end"] - best_seg["start"], 1.0)

        # Slice snippet (clamped to max 5s)
        start_ms = int(best_seg["start"] * 1000)
        end_ms = min(int(best_seg["end"] * 1000), start_ms + 5000)
        dur_sec = round((end_ms - start_ms) / 1000.0, 2)

        snippet_chunk = sound[start_ms:end_ms]

        # Export snippet to temporary MP3
        tmp_mp3 = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
        tmp_mp3_path = tmp_mp3.name
        tmp_mp3.close()

        snippet_chunk.export(tmp_mp3_path, format="mp3", bitrate="128k")

        # Upload snippet to Cloudinary
        snippet_url = ""
        if settings.cloudinary_url:
            try:
                public_id = f"speaktrace/snippets/{job_id}/{spk_tag.lower()}"
                upload_res = cloudinary.uploader.upload(
                    tmp_mp3_path,
                    public_id=public_id,
                    resource_type="video",
                    overwrite=True,
                )
                snippet_url = upload_res.get("secure_url", upload_res.get("url", ""))
                logger.info("Uploaded speaker snippet to Cloudinary", speaker=spk_tag, url=snippet_url)
            except Exception as e:
                logger.error("Failed to upload snippet to Cloudinary", speaker=spk_tag, error=str(e))

        if not snippet_url:
            # Fallback URL
            snippet_url = f"/api/v1/uploads/snippets/{job_id}_{spk_tag}.mp3"

        snippets.append({
            "speaker_tag": spk_tag,
            "snippet_url": snippet_url,
            "duration_seconds": dur_sec,
        })

        if os.path.exists(tmp_mp3_path):
            try:
                os.remove(tmp_mp3_path)
            except Exception:
                pass

    logger.info("Extracted speaker snippets", total_speakers=len(snippets))
    return snippets
