"""
Nova V2 – LLM Gateway (FastAPI)
Secure backend: API keys never leave the server.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from openai import APIConnectionError, AuthenticationError, RateLimitError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ai_provider import ProviderError, create_provider
from config import AIConfig

load_dotenv()

app = FastAPI(title="Nova LLM Gateway", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

NOVA_SYSTEM_PROMPT = """You are Nova, a professional AI Coding Assistant.

Identity:
- Your name is Nova.
- You help developers with code, debugging, architecture, and best practices.
- You are precise, practical, and honest.

Rules:
1. Preserve conversation context. When the user says "fix this", "optimize it", or "convert the same code", refer to the most recent relevant code or topic in this conversation.
2. Give specialized answers about the language/framework the user is discussing.
3. If the request is ambiguous, ask a short clarifying question before guessing.
4. When analyzing bugs: explain the root cause, then provide a concrete fix.
5. Do not rewrite the user's code unless they asked for a change.
6. Never claim you executed code, accessed files, or ran tests unless that actually happened in this session.
7. Prefer correct, minimal examples over long generic essays.
8. Put code in fenced markdown blocks with a language tag (```python, ```typescript, etc.).
9. Reply in the same language the user is using (Persian, English, ...).
10. If you are unsure, say so clearly.

You do not have filesystem, terminal, or network tools in this version unless explicitly provided in the message context.
"""

MAX_HISTORY_MESSAGES = int(os.getenv("NOVA_MAX_HISTORY", "40"))


class FileContext(BaseModel):
    path: str
    content: str = Field(..., max_length=100_000)
    language: Optional[str] = None


class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    stream: bool = True
    files: Optional[List[FileContext]] = None


class ChatResponse(BaseModel):
    content: str
    model: str
    provider: str = "openai-compatible"


def _get_config() -> AIConfig:
    try:
        return AIConfig.from_env()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _trim_history(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Keep system + last N messages to control token usage."""
    if len(messages) <= MAX_HISTORY_MESSAGES:
        return messages
    # Always drop from the oldest non-system messages
    system = [m for m in messages if m.get("role") == "system"]
    rest = [m for m in messages if m.get("role") != "system"]
    return system + rest[-(MAX_HISTORY_MESSAGES - len(system)) :]


def _build_messages(req: ChatRequest) -> List[Dict[str, str]]:
    messages: List[Dict[str, str]] = [{"role": "system", "content": NOVA_SYSTEM_PROMPT}]

    if req.files:
        parts = ["Project/file context provided by the user:"]
        for f in req.files[:10]:
            lang = f.language or ""
            parts.append(f"\n--- file: {f.path} ---\n```{lang}\n{f.content}\n```")
        messages.append({"role": "system", "content": "\n".join(parts)})

    for m in req.messages:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    return _trim_history(messages)


@app.get("/health")
def health() -> Dict[str, Any]:
    configured = bool(os.getenv("AI_API_KEY") and os.getenv("AI_API_KEY") != "your_api_key_here")
    learning_ok = False
    try:
        from learning import LearningBrain
        learning_ok = True
    except Exception:  # noqa: BLE001
        pass
    return {
        "status": "ok",
        "service": "nova-gateway",
        "version": "3.0.0",
        "llm_configured": configured,
        "model": os.getenv("AI_MODEL", "gpt-4o-mini"),
        "code_engine": True,
        "debug_engine": True,
        "learning_brain": learning_ok,
    }


class AnalyzeRequest(BaseModel):
    content: str = Field(..., max_length=500_000)
    file_name: Optional[str] = None
    mime: Optional[str] = None
    language_hint: Optional[str] = None


@app.post("/api/analyze")
def analyze_code(req: AnalyzeRequest) -> Dict[str, Any]:
    """Run Code Intelligence Engine on uploaded source."""
    try:
        from code_engine import analyze_source, build_llm_context
        result = analyze_source(
            req.content,
            file_name=req.file_name,
            mime=req.mime,
            language_hint=req.language_hint,
        )
        return {
            "ok": True,
            "result": result.to_dict(),
            "llm_context": build_llm_context(result),
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc


class DebugRequest(BaseModel):
    source_code: Optional[str] = None
    files: Optional[List[Dict[str, Any]]] = None
    error_message: Optional[str] = None
    stack_trace: Optional[str] = None
    user_description: Optional[str] = None
    expected_behavior: Optional[str] = None
    actual_behavior: Optional[str] = None


@app.post("/api/debug")
def debug_code(req: DebugRequest) -> Dict[str, Any]:
    """Run Debugging Intelligence Engine (Phase 3 – evidence + learning)."""
    try:
        from debug_engine import run_debug, build_llm_debug_context, format_debug_report
        payload = req.model_dump() if hasattr(req, "model_dump") else req.dict()
        session = run_debug(payload)
        return {
            "ok": True,
            "session": session.to_dict(),
            "report": format_debug_report(session),
            "llm_context": build_llm_debug_context(session),
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Debug failed: {exc}") from exc


@app.post("/api/chat")
def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages is required")

    config = _get_config()
    provider = create_provider(config)
    messages = _build_messages(req)

    if req.stream:
        return StreamingResponse(
            _stream_chat(provider, messages, config.model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        content = provider.chat(messages)
        return ChatResponse(content=content, model=config.model)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _stream_chat(provider, messages: List[dict], model: str):
    """Yield SSE events from OpenAI-compatible streaming API."""
    try:
        client = provider.client
        stream = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=provider.config.temperature,
            max_tokens=provider.config.max_tokens,
            stream=True,
        )
        for chunk in stream:
            delta = ""
            try:
                delta = chunk.choices[0].delta.content or ""
            except (AttributeError, IndexError):
                delta = ""
            if delta:
                payload = json.dumps({"type": "token", "content": delta}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except AuthenticationError:
        err = json.dumps({"type": "error", "message": "Authentication failed. Check AI_API_KEY on the server."})
        yield f"data: {err}\n\n"
    except RateLimitError:
        err = json.dumps({"type": "error", "message": "Rate limit exceeded. Please wait and retry."})
        yield f"data: {err}\n\n"
    except APIConnectionError:
        err = json.dumps({"type": "error", "message": "Could not reach the LLM provider. Check network and AI_BASE_URL."})
        yield f"data: {err}\n\n"
    except Exception as exc:  # noqa: BLE001
        err = json.dumps({"type": "error", "message": f"LLM error: {exc}"})
        yield f"data: {err}\n\n"


# Import error types used in streaming
if __name__ == "__main__":
    import uvicorn

    host = os.getenv("NOVA_HOST", "127.0.0.1")
    port = int(os.getenv("NOVA_PORT", "8000"))
    uvicorn.run("server:app", host=host, port=port, reload=False)
