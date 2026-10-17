import uuid

import httpx
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import clear_session, current_user, hash_password, set_session, verify_password
from lib.db import db
from routers.billing import require_pro
from lib.resume import extract_pdf_text, summarize_resume
from models.schemas import GoogleSessionIn, LoginIn, OkOut, ProfileUpdate, RegisterIn, ResumeUploadIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _out(u: dict) -> UserOut:
    return UserOut(**{k: u.get(k, "") for k in UserOut.model_fields})


@router.post("/register", response_model=UserOut)
async def register(body: RegisterIn, response: Response, request: Request):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = {
        "id": str(uuid.uuid4()), "email": email, "name": body.name.strip(),
        "password_hash": hash_password(body.password), "role": "candidate",
        "target_role": body.target_role, "experience_level": body.experience_level,
        "resume_summary": "", "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    set_session(response, user["id"], request)
    return _out(user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response, request: Request):
    user = await db.users.find_one({"email": body.email.lower()})
    if user and not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="This account uses Google sign-in — use 'Continue with Google'")
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_session(response, user["id"], request)
    return _out(user)


EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


@router.post("/google", response_model=UserOut)
async def google_session(body: GoogleSessionIn, response: Response, request: Request):
    """Exchange the one-time Emergent Google session_id (server-side only) for our own session cookie.
    Users are linked by email, so an existing email/password account gains Google sign-in."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Google sign-in is temporarily unavailable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in failed or expired — please try again")
    data = r.json()
    email = str(data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        upd = {"google_id": data.get("id"), "picture": data.get("picture", "")}
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        user.update(upd)
    else:
        user = {
            "id": str(uuid.uuid4()), "email": email, "name": data.get("name") or email.split("@")[0],
            "password_hash": None, "role": "candidate", "google_id": data.get("id"), "picture": data.get("picture", ""),
            "target_role": "SOC Analyst L1", "experience_level": "Entry Level", "resume_summary": "",
            "created_at": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(user))
    set_session(response, user["id"], request)
    return _out(user)


@router.post("/logout", response_model=OkOut)
async def logout(response: Response):
    clear_session(response)
    return OkOut()


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return _out(user)


@router.put("/profile", response_model=UserOut)
async def update_profile(body: ProfileUpdate, user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": body.model_dump()})
    return _out({**user, **body.model_dump()})


@router.post("/resume", response_model=UserOut)
async def upload_resume(body: ResumeUploadIn, user: dict = Depends(require_pro)):
    text = extract_pdf_text(body.pdf_b64)
    summary = await summarize_resume(text)
    upd = {"resume_summary": summary, "resume_filename": body.filename, "resume_text": text,
           "resume_uploaded_at": datetime.now(timezone.utc)}
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return _out({**user, **upd})


@router.delete("/resume", response_model=UserOut)
async def delete_resume(user: dict = Depends(current_user)):
    upd = {"resume_summary": "", "resume_filename": "", "resume_text": ""}
    await db.users.update_one({"id": user["id"]}, {"$set": upd})
    return _out({**user, **upd})
