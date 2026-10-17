"""Shared candidate-answer processing: STT + audio metrics + optional recording storage."""
import base64
import os

from fastapi import HTTPException

from lib.voice import filler_counts, transcribe

from lib.paths import DATA_DIR

UPLOADS = DATA_DIR / "recordings"
UPLOADS.mkdir(parents=True, exist_ok=True)


async def process_answer(audio_b64: str | None, mime: str, text: str | None) -> dict:
    if audio_b64:
        stt = await transcribe(audio_b64, mime)
        transcript, duration = stt["text"], stt["duration"]
        clarity, pauses = stt["clarity"], stt["long_pauses"]
    elif text and text.strip():
        transcript, duration, clarity, pauses = text.strip(), 0.0, None, 0
    else:
        raise HTTPException(status_code=422, detail="Provide audio_b64 or text")
    words = len(transcript.split())
    wpm = round(words / (duration / 60), 1) if duration > 3 and words else None
    return {"transcript": transcript, "duration": duration, "wpm": wpm, "fillers": filler_counts(transcript),
            "clarity": clarity, "long_pauses": pauses, "words": words}


def save_audio(rid: str, audio_b64: str, mime: str) -> str:
    ext = "mp4" if "mp4" in mime else "webm"
    path = UPLOADS / f"{rid}.{ext}"
    path.write_bytes(base64.b64decode(audio_b64.split(",")[-1]))
    return str(path)


def delete_audio(path: str | None) -> None:
    if path and os.path.exists(path):
        os.remove(path)
