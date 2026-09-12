import os
import tempfile
import httpx
from pydub import AudioSegment
from src.logger import logger


async def download_and_normalize_audio(audio_url: str, output_path: str | None = None) -> str:
    """
    Downloads an audio file from a remote URL (e.g. Cloudinary) and converts it
    to a standardized 16kHz 16-bit mono WAV format required for diarization & transcription.
    """
    if not output_path:
        tmp_fd, output_path = tempfile.mkstemp(suffix=".wav")
        os.close(tmp_fd)

    temp_raw = tempfile.NamedTemporaryFile(delete=False, suffix=".tmp")
    temp_raw_path = temp_raw.name
    temp_raw.close()

    try:
        logger.info("Downloading audio asset", url=audio_url)
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            resp = await client.get(audio_url)
            resp.raise_for_status()
            with open(temp_raw_path, "wb") as f:
                f.write(resp.content)

        # Convert to 16kHz mono WAV using pydub
        logger.info("Normalizing audio to 16kHz mono WAV", source=temp_raw_path)
        audio = AudioSegment.from_file(temp_raw_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio.export(output_path, format="wav")
        logger.info("Audio normalized successfully", path=output_path, duration_ms=len(audio))

        return output_path
    finally:
        if os.path.exists(temp_raw_path):
            try:
                os.remove(temp_raw_path)
            except Exception:
                pass
