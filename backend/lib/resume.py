"""Resume PDF parsing: extract text, then summarize only the facts present (never invent)."""
import base64
import io

from fastapi import HTTPException
from pypdf import PdfReader

from lib.llm import llm_json

MAX_BYTES = 5 * 1024 * 1024


def extract_pdf_text(pdf_b64: str) -> str:
    try:
        raw = base64.b64decode(pdf_b64.split(",")[-1], validate=False)
    except Exception:
        raise HTTPException(status_code=422, detail="File could not be read")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Resume must be under 5 MB")
    if not raw.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="Please upload a PDF file")
    try:
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join((p.extract_text() or "") for p in reader.pages[:8])
    except Exception:
        raise HTTPException(status_code=422, detail="This PDF could not be read")
    text = " ".join(text.split())
    if len(text) < 80:
        raise HTTPException(status_code=422, detail="No readable text found — scanned/image PDFs aren't supported. Try exporting your resume as a text PDF.")
    return text[:15000]


async def summarize_resume(text: str) -> str:
    out = await llm_json(
        "You extract resume facts for interviewers. Use ONLY facts explicitly written in the resume. Never infer, embellish or invent employers, dates, titles, certifications or achievements. Respond ONLY with JSON.",
        f"""RESUME TEXT:\n{text}\n\nReturn JSON: {{"summary": "a factual plain-text profile under 1800 characters with these labeled lines: Current/most recent role; Work history (title, employer, dates, 1-2 key duties each); Certifications; Education; Tools & technologies; Projects / home lab; Notable achievements. Write 'None listed' when absent."}}""",
    )
    summary = str(out.get("summary") or "").strip()
    if not summary:
        raise HTTPException(status_code=502, detail="Could not summarize the resume")
    return summary[:2500]
