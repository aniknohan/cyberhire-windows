import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, ensure_indexes  # noqa: E402
from lib.seed import seed_all  # noqa: E402
from routers import auth, billing, content, interviews, practice, stats  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    await seed_all()
    yield
    client.close()


app = FastAPI(lifespan=lifespan, title="CyberHire API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "CyberHire API"}


for module in (auth, interviews, content, practice, stats, billing):
    api_router.include_router(module.router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Session-Token"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Include the router in the main app — keep last.
app.include_router(api_router)


# Desktop app: the built React UI is served from this same local server, so the frontend's
# relative /api calls and the session cookie work exactly as on the hosted site.
FRONTEND_DIR = Path(os.environ.get("SOC_FRONTEND_DIR") or (ROOT_DIR.parent / "frontend" / "dist")).resolve()
if FRONTEND_DIR.is_dir():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not Found")
        f = (FRONTEND_DIR / full_path).resolve()
        if full_path and f.is_file() and FRONTEND_DIR in f.parents:
            headers = {"Cache-Control": "public, max-age=31536000, immutable"} if full_path.startswith("assets/") else {"Cache-Control": "no-cache"}
            return FileResponse(f, headers=headers)
        return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})
