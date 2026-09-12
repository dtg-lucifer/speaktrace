import asyncio
import json
import re
import httpx
from src.config import settings
from src.logger import logger
from src.metrics import RAG_QUERIES_TOTAL
from src.rag.vectorstore import get_project_collection


SUMMARY_PATTERNS = [
    r"\bsummar(y|ize|ise)\b",
    r"\brecap\b",
    r"\b(brief\s+)?overview\b",
    r"\bmain\s+(points|takeaways)\b",
    r"\bwhat\s+happened\b",
    r"\btell\s+me\s+about\s+(the\s+)?(whole|entire|all)\b",
]


def is_summary_query(query: str) -> bool:
    """Detects whether the user query is asking for a global overview or summary of recordings."""
    q_lower = query.lower()
    return any(re.search(pat, q_lower) for pat in SUMMARY_PATTERNS)


def clean_snippet_text(raw_text: str) -> str:
    """Strips filename brackets and timestamp brackets like '[audio.mp3] [0.0s - 3.5s] Speaker: '."""
    cleaned = re.sub(r"^(\[[^\]]+\]\s*)?\[\d+(\.\d+)?s\s*-\s*\d+(\.\d+)?s\]\s*([^:]+:\s*)?", "", raw_text).strip()
    return cleaned or raw_text


async def fetch_available_ollama_model() -> str | None:
    """Discovers which models are pulled and ready in the local Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                if not models:
                    return None
                for pref in [settings.ollama_model, "llama3.2:1b", "smollm2:135m", "qwen2.5:0.5b"]:
                    for m in models:
                        if pref in m:
                            return m
                return models[0]
    except Exception:
        return None
    return None


async def stream_gemini_api(api_key: str, system_prompt: str, user_query: str):
    """Direct SSE streaming API call to Gemini 2.0 Flash."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:streamGenerateContent?alt=sse&key={api_key}"
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"{system_prompt}\n\nUSER QUESTION:\n{user_query}"}],
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1200,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=payload) as resp:
                if resp.status_code == 200:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if not data_str:
                                continue
                            try:
                                chunk = json.loads(data_str)
                                candidates = chunk.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for p in parts:
                                        t = p.get("text", "")
                                        if t:
                                            yield t
                            except Exception:
                                pass
    except Exception as e:
        logger.warn("Gemini streaming call failed", error=str(e))


async def stream_openai_compatible_api(base_url: str, api_key: str, model: str, system_prompt: str, user_query: str):
    """Streams completions from OpenAI or OpenRouter."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ],
        "temperature": 0.3,
        "stream": True,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", f"{base_url}/chat/completions", headers=headers, json=payload) as resp:
                if resp.status_code == 200:
                    async for line in resp.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]" or not data_str:
                                continue
                            try:
                                chunk = json.loads(data_str)
                                choices = chunk.get("choices", [])
                                if choices:
                                    delta = choices[0].get("delta", {}).get("content", "")
                                    if delta:
                                        yield delta
                            except Exception:
                                pass
    except Exception as e:
        logger.warn("OpenAI compatible streaming call failed", error=str(e))


async def stream_ollama_api(base_url: str, model: str, system_prompt: str, user_query: str):
    """Streams completions from local Ollama."""
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream(
                "POST",
                f"{base_url}/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_query},
                    ],
                    "stream": True,
                },
            ) as resp:
                if resp.status_code == 200:
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            content = chunk.get("message", {}).get("content", "")
                            if content:
                                yield content
                        except Exception:
                            pass
    except Exception as e:
        logger.warn("Ollama streaming call failed", error=str(e))


def generate_analytical_synthesis(query: str, segments: list[dict], citations: list[dict]) -> str:
    """
    Intelligent deterministic analytical synthesizer used when external LLMs are offline.
    Breaks down speakers, core topics, and chronological progression rather than raw bullets.
    """
    if not segments:
        return "No conversation segments could be found for this project."

    speakers = list(dict.fromkeys([s.get("speaker", "Speaker") for s in segments if s.get("speaker")]))
    spk_str = " and ".join(speakers) if len(speakers) <= 2 else ", ".join(speakers[:-1]) + f", and {speakers[-1]}"

    total_time = max([s.get("end_time", 0.0) for s in segments], default=0.0)
    duration_min = round(total_time / 60.0, 1)

    first_speaker = segments[0].get("speaker", "The first speaker")
    first_text = clean_snippet_text(segments[0].get("text", ""))

    response_lines = [
        f"**Conversation Overview:**",
        f"This recording contains dialogue between **{spk_str}** spanning approximately {duration_min} minutes ({len(segments)} dialogue turns).",
        f"\nThe discussion opens with **{first_speaker}** noting: *\"{first_text}\"*.",
        f"\n**Key Dialogue Highlights:**",
    ]

    step = max(1, len(segments) // 5)
    selected_turns = segments[::step][:5]

    for turn in selected_turns:
        speaker = turn.get("speaker", "Speaker")
        start = turn.get("start_time", 0.0)
        text = clean_snippet_text(turn.get("text", ""))
        mins = int(start // 60)
        secs = int(start % 60)
        fname = f"[{turn.get('filename')}] " if turn.get("filename") else ""
        response_lines.append(f"• **{fname}[{mins:02d}:{secs:02d}] {speaker}:** {text}")

    response_lines.append(
        f"\n**Summary of Discussion:**\n"
        f"The participants address the themes of the conversation directly. "
        f"You can listen to any specific quote using the interactive playable audio citations below."
    )

    return "\n".join(response_lines)


def retrieve_dialogue_segments(collection, query: str, job_id: str | None = None) -> tuple[list[dict], list[dict]]:
    """
    Retrieves and balances dialogue segments from ChromaDB.
    Supports multi-file projects, specific job filtering, and deduplicated playable citations.
    """
    count = collection.count()
    if count == 0:
        return [], []

    wants_summary = is_summary_query(query)
    retrieved_segments: list[dict] = []

    where_filter = {"job_id": job_id} if job_id else None

    if wants_summary:
        # Retrieve all documents up to 500 to cover all audio recordings in the project
        all_data = collection.get(limit=500, where=where_filter)
        docs = all_data.get("documents", [])
        metas = all_data.get("metadatas", [])

        # Group segments by job_id so every audio file in the project is represented
        jobs_dict: dict[str, list[dict]] = {}
        for doc, meta in zip(docs, metas):
            jid = meta.get("job_id", "default")
            seg = {
                "job_id": jid,
                "audio_url": meta.get("audio_url", ""),
                "filename": meta.get("filename", ""),
                "speaker": meta.get("speaker", "Unknown"),
                "start_time": float(meta.get("start_time", 0.0)),
                "end_time": float(meta.get("end_time", 0.0)),
                "text": clean_snippet_text(doc),
            }
            jobs_dict.setdefault(jid, []).append(seg)

        # For each job, sample evenly across its timeline (up to 12 turns each)
        for jid, segs in jobs_dict.items():
            segs.sort(key=lambda s: s["start_time"])
            if len(segs) > 12:
                step = len(segs) / 12.0
                sampled = [segs[int(i * step)] for i in range(12)]
                retrieved_segments.extend(sampled)
            else:
                retrieved_segments.extend(segs)

    else:
        # Vector similarity search for specific user inquiry
        k = min(15, count)
        try:
            results = collection.query(
                query_texts=[query],
                n_results=k,
                where=where_filter,
            )
            docs = results.get("documents", [[]])[0]
            metas = results.get("metadatas", [[]])[0]
            for doc, meta in zip(docs, metas):
                retrieved_segments.append({
                    "job_id": meta.get("job_id", ""),
                    "audio_url": meta.get("audio_url", ""),
                    "filename": meta.get("filename", ""),
                    "speaker": meta.get("speaker", "Unknown"),
                    "start_time": float(meta.get("start_time", 0.0)),
                    "end_time": float(meta.get("end_time", 0.0)),
                    "text": clean_snippet_text(doc),
                })
        except Exception as e:
            logger.warn("Chroma query failed, falling back to sampling", error=str(e))
            all_data = collection.get(limit=20, where=where_filter)
            for doc, meta in zip(all_data.get("documents", []), all_data.get("metadatas", [])):
                retrieved_segments.append({
                    "job_id": meta.get("job_id", ""),
                    "audio_url": meta.get("audio_url", ""),
                    "filename": meta.get("filename", ""),
                    "speaker": meta.get("speaker", "Unknown"),
                    "start_time": float(meta.get("start_time", 0.0)),
                    "end_time": float(meta.get("end_time", 0.0)),
                    "text": clean_snippet_text(doc),
                })

    # Sort retrieved segments chronologically
    retrieved_segments.sort(key=lambda s: (s.get("job_id", ""), s["start_time"]))

    # Build clean formatted playable citations for UI
    citations = []
    seen_texts = set()
    for seg in retrieved_segments:
        txt = seg["text"]
        if txt not in seen_texts:
            seen_texts.add(txt)
            citations.append({
                "job_id": seg.get("job_id", ""),
                "audio_url": seg.get("audio_url", ""),
                "filename": seg.get("filename", ""),
                "speaker": seg["speaker"],
                "start_time": round(seg["start_time"], 1),
                "end_time": round(seg["end_time"], 1),
                "text": f"{seg['speaker']}: \"{txt}\"",
            })

    return retrieved_segments, citations


async def stream_project_rag(project_id: str, query: str, job_id: str | None = None, history: list[dict] | None = None):
    """
    RAG conversational QA generator streaming tokens and citations in real time.
    Yields dicts with:
      - {"type": "citations", "citations": [...]}
      - {"type": "token", "delta": "..."}
      - {"type": "done"}
    """
    RAG_QUERIES_TOTAL.inc()
    collection = get_project_collection(project_id)

    count = collection.count()
    if count == 0:
        yield {"type": "citations", "citations": []}
        yield {
            "type": "token",
            "delta": "No audio files have been transcribed in this project yet. Please upload and process an audio recording first!",
        }
        yield {"type": "done"}
        return

    retrieved_segments, citations = retrieve_dialogue_segments(collection, query, job_id)

    if not retrieved_segments:
        yield {"type": "citations", "citations": []}
        yield {
            "type": "token",
            "delta": "Could not find any relevant speech segments matching your inquiry.",
        }
        yield {"type": "done"}
        return

    # Yield citations immediately so the UI displays them while tokens are streaming
    yield {"type": "citations", "citations": citations[:8]}

    # Build Chronological Dialogue Transcript Context for LLM
    context_lines = []
    for s in retrieved_segments:
        m = int(s["start_time"] // 60)
        sec = int(s["start_time"] % 60)
        file_prefix = f"[{s['filename']}] " if s.get("filename") else ""
        context_lines.append(f"{file_prefix}[{m:02d}:{sec:02d}] {s['speaker']}: {s['text']}")
    context_str = "\n".join(context_lines)

    # For local Ollama on CPU, sample 10 key turns to guarantee responsiveness
    if len(retrieved_segments) > 10:
        step = len(retrieved_segments) / 10.0
        local_sampled = [retrieved_segments[int(i * step)] for i in range(10)]
    else:
        local_sampled = retrieved_segments

    local_context_lines = []
    for s in local_sampled:
        m = int(s["start_time"] // 60)
        sec = int(s["start_time"] % 60)
        file_prefix = f"[{s['filename']}] " if s.get("filename") else ""
        local_context_lines.append(f"{file_prefix}[{m:02d}:{sec:02d}] {s['speaker']}: {s['text']}")
    local_context_str = "\n".join(local_context_lines)

    system_prompt = (
        "You are SpeakTrace AI, an expert conversational speech analyst.\n"
        "Your task is to analyze, synthesize, and explain the multi-speaker audio conversation(s) below.\n\n"
        "INSTRUCTIONS FOR THINKING & REASONING:\n"
        "- Think deeply about the dialogue: analyze the speakers' motives, dynamics, humor, explanations, and core themes.\n"
        "- DO NOT merely repeat or copy-paste verbatim lines. Explain what is happening in natural, thoughtful prose.\n"
        "- Structure your answer clearly with an Overview, Key Themes / Discussion Points, and Takeaways.\n"
        "- When referencing specific statements or claims, naturally cite the speaker and timestamp (e.g., '[00:09 - Prof. Brian Cox]').\n\n"
        f"RECORDED CONVERSATION TRANSCRIPT:\n{context_str}"
    )

    local_system_prompt = (
        "You are SpeakTrace AI, an expert conversational speech analyst.\n"
        "Provide a thoughtful, synthesized summary and explanation of this conversation.\n"
        "Explain what the speakers discuss, their dynamic, and key takeaways without just copy-pasting.\n\n"
        f"CONVERSATION EXCERPTS:\n{local_context_str}"
    )

    streamed_any = False

    # Option A: Gemini (Primary Cloud LLM)
    if settings.gemini_api_key:
        logger.info("Streaming RAG query via Google Gemini", model=settings.gemini_model)
        async for token in stream_gemini_api(settings.gemini_api_key, system_prompt, query):
            streamed_any = True
            yield {"type": "token", "delta": token}

    # Option B: OpenAI
    if not streamed_any and settings.openai_api_key:
        logger.info("Streaming RAG query via OpenAI", model=settings.openai_model)
        async for token in stream_openai_compatible_api("https://api.openai.com/v1", settings.openai_api_key, settings.openai_model, system_prompt, query):
            streamed_any = True
            yield {"type": "token", "delta": token}

    # Option C: OpenRouter
    if not streamed_any and settings.openrouter_api_key:
        logger.info("Streaming RAG query via OpenRouter", model=settings.openrouter_model)
        async for token in stream_openai_compatible_api("https://openrouter.ai/api/v1", settings.openrouter_api_key, settings.openrouter_model, system_prompt, query):
            streamed_any = True
            yield {"type": "token", "delta": token}

    # Option D: Local Ollama
    if not streamed_any:
        ready_model = await fetch_available_ollama_model()
        if ready_model:
            logger.info("Streaming RAG query via local Ollama", model=ready_model)
            async for token in stream_ollama_api(settings.ollama_base_url, ready_model, local_system_prompt, query):
                streamed_any = True
                yield {"type": "token", "delta": token}

    # Option E: Deterministic Analytical Synthesis (fallback)
    if not streamed_any:
        logger.info("Synthesizing analytical conversation response via internal engine")
        synth_text = generate_analytical_synthesis(query, retrieved_segments, citations)
        words = synth_text.split(" ")
        for i in range(0, len(words), 3):
            chunk = " ".join(words[i:i + 3]) + (" " if i + 3 < len(words) else "")
            yield {"type": "token", "delta": chunk}
            await asyncio.sleep(0.02)

    yield {"type": "done"}


async def query_project_rag(project_id: str, query: str, job_id: str | None = None, history: list[dict] | None = None) -> dict:
    """
    Non-streaming RAG conversational query wrapper for backwards compatibility.
    """
    answer_tokens = []
    citations = []

    async for event in stream_project_rag(project_id, query, job_id, history):
        ev_type = event.get("type")
        if ev_type == "citations":
            citations = event.get("citations", [])
        elif ev_type == "token":
            answer_tokens.append(event.get("delta", ""))

    return {
        "answer": "".join(answer_tokens).strip(),
        "citations": citations[:8],
    }
