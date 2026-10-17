"""Auth helpers: bcrypt passwords, JWT in an httpOnly cookie, current-user dependencies."""
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Response
from passlib.context import CryptContext

from lib.db import db

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
COOKIE = "soc_session"
ALGO = "HS256"


def hash_password(p: str) -> str:
    return pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    try:
        return pwd.verify(p, h)
    except Exception:
        return False


def set_session(response: Response, user_id: str, request: Request | None = None) -> None:
    token = jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7)},
        os.environ["JWT_SECRET"],
        algorithm=ALGO,
    )
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=os.environ.get("COOKIE_SECURE", "1") == "1", max_age=7 * 86400, path="/")
    # Only the Android app (bundled origin, can't use the cookie) asks for the token in a header; it sends it
    # back as "Authorization: Bearer <token>". Web clients never receive it, so the cookie stays JS-unreadable.
    if request is not None and request.headers.get("x-cyberhire-client") == "android":
        response.headers["X-Session-Token"] = token


def clear_session(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")


async def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE)
    auth = request.headers.get("authorization", "")
    if not token and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def admin_user(user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
