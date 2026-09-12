import os
import tempfile
import cloudinary
import cloudinary.uploader
from src.config import settings
from src.logger import logger


def format_seconds_to_vtt(seconds: float) -> str:
    """Formats seconds to WebVTT timestamp format: HH:MM:SS.mmm"""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    return f"{hrs:02d}:{mins:02d}:{secs:02d}.{millis:03d}"


def render_vtt(segments: list[dict]) -> str:
    """Renders WebVTT formatted subtitles."""
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(segments, 1):
        start_vtt = format_seconds_to_vtt(seg["start"])
        end_vtt = format_seconds_to_vtt(seg["end"])
        spk = seg["speaker"]
        txt = seg["text"]
        lines.append(f"{i}")
        lines.append(f"{start_vtt} --> {end_vtt}")
        lines.append(f"<v {spk}>{txt}</v>")
        lines.append("")
    return "\n".join(lines)


def render_txt(segments: list[dict]) -> str:
    """Renders standard readable transcript text."""
    lines = []
    for seg in segments:
        spk = seg["speaker"]
        txt = seg["text"]
        lines.append(f"{spk} -> {txt}")
    return "\n".join(lines)


def render_custom_template(segments: list[dict], template: str) -> str:
    """
    Renders transcript using user-defined grammar template.
    Example template:
    [$PERSON] -> $SPEECH
    ***
    """
    output_blocks = []
    for seg in segments:
        block = template
        block = block.replace("[$PERSON]", seg["speaker"])
        block = block.replace("$PERSON", seg["speaker"])
        block = block.replace("[$SPEECH]", seg["text"])
        block = block.replace("$SPEECH", seg["text"])
        block = block.replace("[$START]", str(seg["start"]))
        block = block.replace("[$END]", str(seg["end"]))
        output_blocks.append(block)
    return "\n".join(output_blocks)


def format_and_upload_transcript(
    segments: list[dict],
    job_id: str,
    export_format: str = "vtt",
    custom_template: str | None = None,
) -> tuple[str, str]:
    """
    Renders transcript according to requested format and uploads to Cloudinary.
    Returns (rendered_content_string, storage_url).
    """
    fmt = export_format.lower()
    if fmt == "custom" and custom_template:
        content = render_custom_template(segments, custom_template)
        ext = "txt"
    elif fmt == "txt":
        content = render_txt(segments)
        ext = "txt"
    else:
        content = render_vtt(segments)
        ext = "vtt"

    storage_url = ""
    if settings.cloudinary_url:
        tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}", mode="w", encoding="utf-8")
        tmp_path = tmp_file.name
        tmp_file.write(content)
        tmp_file.close()

        try:
            public_id = f"speaktrace/transcripts/{job_id}/transcript.{ext}"
            res = cloudinary.uploader.upload(
                tmp_path,
                public_id=public_id,
                resource_type="raw",
                overwrite=True,
            )
            storage_url = res.get("secure_url", res.get("url", ""))
            logger.info("Uploaded transcript to Cloudinary", job_id=job_id, url=storage_url)
        except Exception as e:
            logger.error("Failed to upload transcript to Cloudinary", error=str(e))
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    return content, storage_url
