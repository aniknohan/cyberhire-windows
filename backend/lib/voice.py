"""VOICE ENGINE + SPEECH RECOGNITION: Whisper STT with audio-derived clarity, OpenAI TTS.

Kept independent of the interview AI so either side can be replaced by another provider.
"""
import base64
import logging
import math
import os
import re

import httpx
from fastapi import HTTPException

from lib.llm import openai_base

# Voices accepted by the classic tts-1 model (gpt-4o-mini-tts accepts these and more).
TTS1_VOICES = {"alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer"}

logger = logging.getLogger(__name__)

# Biases Whisper toward verbatim transcription so filler words are kept for coaching.
VERBATIM_PROMPT = "Umm, so, uh, I think, like, you know... Hmm, okay. SIEM, EDR, Kerberos, PowerShell, MITRE ATT&CK."

FILLER_PATTERNS = {
    "um": r"\b(um+|umm+|erm)\b",
    "uh": r"\b(uh+|er+|hmm+)\b",
    "like": r"(?:,\s*like\b|\blike,)",
    "you know": r"\byou know\b(?!\s+(?:how|what|that|the|about|where|why|when))",
    "basically": r"\bbasically\b",
    "actually": r"\bactually\b",
    "so": r"(?:^|[.?!]\s+)so,",
    "i mean": r"\bi mean\b",
}


def _get(obj, key, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def filler_counts(text: str) -> dict[str, int]:
    t = text.lower()
    out = {}
    for name, pat in FILLER_PATTERNS.items():
        n = len(re.findall(pat, t))
        if n:
            out[name] = n
    return out


async def transcribe(audio_b64: str, mime: str = "audio/webm") -> dict:
    """Returns {text, duration, clarity, long_pauses}. clarity is derived from Whisper's
    per-segment confidence on the actual audio (an intelligibility proxy, not an accent score)."""
    ext = "webm"
    for k in ("mp4", "m4a", "wav", "mpeg", "mp3", "ogg"):
        if k in mime:
            ext = {"ogg": "webm", "mpeg": "mp3"}.get(k, k)
    raw = base64.b64decode(audio_b64.split(",")[-1])
    if len(raw) < 1500:
        return {"text": "", "duration": 0.0, "clarity": None, "long_pauses": 0}
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="Speech recognition needs an OpenAI API key — add it in Settings → API keys, or type your answer instead.")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=20.0)) as client:
            r = await client.post(
                f"{openai_base()}/audio/transcriptions",
                headers={"Authorization": f"Bearer {key}"},
                data={"model": "whisper-1", "response_format": "verbose_json", "prompt": VERBATIM_PROMPT, "language": "en"},
                files={"file": (f"answer.{ext}", raw, mime.split(";")[0] or "application/octet-stream")},
            )
        if r.status_code != 200:
            raise RuntimeError(f"{r.status_code}: {r.text[:300]}")
        resp = r.json()
    except Exception as e:
        logger.error("transcribe failed: %s", e)
        raise HTTPException(status_code=502, detail="Speech recognition failed")
    text = (_get(resp, "text") or "").strip()
    duration = float(_get(resp, "duration") or 0.0)
    segments = _get(resp, "segments") or []
    logprobs, pauses, prev_end = [], 0, None
    speech_segments = 0
    for s in segments:
        if (_get(s, "no_speech_prob") or 0) > 0.7:
            continue
        speech_segments += 1
        lp = _get(s, "avg_logprob")
        if lp is not None:
            logprobs.append(lp)
        st = _get(s, "start") or 0
        if prev_end is not None and st - prev_end > 2.0:
            pauses += 1
        prev_end = _get(s, "end") or st
    if segments and speech_segments == 0:
        text = ""  # Whisper hallucination on silence
    clarity = None
    if logprobs:
        avg = sum(logprobs) / len(logprobs)
        clarity = round(max(0.0, min(100.0, 100 * math.exp(avg * 0.9))), 1)
    return {"text": text, "duration": duration, "clarity": clarity, "long_pauses": pauses}


async def synthesize(text: str, voice: str = "alloy", style: str = "") -> str:
    """Returns base64 mp3. Tries the steerable model first, then tts-1."""
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="Interviewer voices need an OpenAI API key — add it in Settings → API keys.")
    text = text[:4000]

    async def _speak(payload: dict) -> str:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=20.0)) as client:
            r = await client.post(f"{openai_base()}/audio/speech", headers={"Authorization": f"Bearer {key}"},
                                  json={**payload, "input": text, "response_format": "mp3"})
        if r.status_code != 200:
            raise RuntimeError(f"{r.status_code}: {r.text[:300]}")
        return base64.b64encode(r.content).decode()

    try:
        return await _speak({"model": "gpt-4o-mini-tts", "voice": voice,
                             "instructions": style or "Speak naturally like a professional on a video call."})
    except Exception as e:
        logger.warning("gpt-4o-mini-tts failed, falling back: %s", e)
    try:
        return await _speak({"model": "tts-1", "voice": voice if voice in TTS1_VOICES else "alloy"})
    except Exception as e:
        logger.error("tts failed: %s", e)
        raise HTTPException(status_code=502, detail="Text-to-speech failed")
