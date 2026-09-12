from src.logger import logger
from src.rag.vectorstore import get_project_collection


def index_transcription_segments(
    project_id: str,
    job_id: str,
    segments: list[dict],
    audio_url: str | None = None,
    filename: str | None = None,
) -> int:
    """
    Chunks and indexes newly processed transcription segments into the project's ChromaDB collection.
    Enables conversational RAG queries with speaker & timestamp citations and playable audio.
    """
    if not project_id or not segments:
        return 0

    collection = get_project_collection(project_id)

    ids = []
    documents = []
    metadatas = []

    for i, seg in enumerate(segments):
        doc_id = f"{job_id}_{i}"
        start_sec = seg.get("start", 0.0)
        end_sec = seg.get("end", 0.0)
        spk = seg.get("speaker", "Unknown")
        txt = seg.get("text", "")

        # Rich text chunk with timestamp and optional filename context
        file_prefix = f"[{filename}] " if filename else ""
        chunk_text = f"{file_prefix}[{start_sec:.1f}s - {end_sec:.1f}s] {spk}: {txt}"

        ids.append(doc_id)
        documents.append(chunk_text)
        metadatas.append({
            "job_id": job_id,
            "project_id": project_id,
            "speaker": spk,
            "start_time": float(start_sec),
            "end_time": float(end_sec),
            "audio_url": audio_url or "",
            "filename": filename or "",
        })

    # Upsert into Chroma collection
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    logger.info("Indexed transcript chunks into project RAG vector store", project_id=project_id, count=len(ids))
    return len(ids)
