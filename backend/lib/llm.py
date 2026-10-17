"""INTERVIEW AI transport: one JSON-returning LLM call with provider fallback.

Same models as the hosted app — Claude Sonnet 4.5 first, GPT-5.2 as fallback — but called
directly with the user's own API keys (set in the desktop app's Settings window):
  ANTHROPIC_API_KEY → Claude Sonnet 4.5      OPENAI_API_KEY → GPT-5.2
Either key alone is enough for the interviewer; voice (speech-to-text / text-to-speech) needs
the OpenAI key. Every engine (interview, scoring, coach) goes through llm_json so the model
is swappable here.
"""
import json
import logging
import os
import re

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.2")
OPENAI_FALLBACK_MODEL = os.environ.get("OPENAI_FALLBACK_MODEL", "gpt-4.1")
TIMEOUT = httpx.Timeout(180.0, connect=20.0)


def _key(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def openai_base() -> str:
    return (os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")


def _parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in response")
    return json.loads(text[start : end + 1])


def _err_text(r: httpx.Response) -> str:
    try:
        j = r.json()
        e = j.get("error")
        if isinstance(e, dict):
            return e.get("message") or json.dumps(e)
        return str(e or j)[:300]
    except Exception:
        return r.text[:300]


async def _anthropic(system: str, prompt: str, model: str) -> str:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": _key("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": model, "max_tokens": 8192, "system": system, "messages": [{"role": "user", "content": prompt}]},
        )
    if r.status_code != 200:
        raise RuntimeError(f"Anthropic {r.status_code}: {_err_text(r)}")
    return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")


async def _openai(system: str, prompt: str, model: str) -> str:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.post(
            f"{openai_base()}/chat/completions",
            headers={"Authorization": f"Bearer {_key('OPENAI_API_KEY')}"},
            json={"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]},
        )
    if r.status_code != 200:
        raise RuntimeError(f"OpenAI {r.status_code}: {_err_text(r)}")
    return r.json()["choices"][0]["message"]["content"] or ""


def _providers():
    out = []
    if _key("ANTHROPIC_API_KEY"):
        out.append(("anthropic", ANTHROPIC_MODEL, _anthropic))
    if _key("OPENAI_API_KEY"):
        out.append(("openai", OPENAI_MODEL, _openai))
        if OPENAI_FALLBACK_MODEL and OPENAI_FALLBACK_MODEL != OPENAI_MODEL:
            out.append(("openai", OPENAI_FALLBACK_MODEL, _openai))
    return out


async def llm_json(system: str, prompt: str) -> dict:
    providers = _providers()
    if not providers:
        raise HTTPException(status_code=503, detail="AI is not set up yet. Open Settings → API keys in the app menu and add your OpenAI (and optionally Anthropic) API key.")
    last_err: Exception | None = None
    for provider, model, call in providers:
        try:
            text = await call(system, prompt, model)
            return _parse_json(text)
        except Exception as e:  # try next provider
            logger.warning("llm_json %s/%s failed: %s", provider, model, e)
            last_err = e
    raise HTTPException(status_code=502, detail=f"AI service unavailable: {last_err}")
