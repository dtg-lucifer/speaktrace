import chromadb
from chromadb.config import Settings as ChromaSettings
from src.config import settings
from src.logger import logger

_chroma_client = None


def get_chroma_client():
    global _chroma_client
    if _chroma_client is None:
        logger.info("Initializing ChromaDB client", path=settings.chroma_persist_dir)
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client


def get_project_collection(project_id: str):
    """Retrieves or creates a Chroma collection scoped to a project."""
    client = get_chroma_client()
    clean_id = project_id.replace("-", "_")
    collection_name = f"proj_{clean_id}"
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"project_id": project_id},
    )
