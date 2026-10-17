"""Entry point for the Windows desktop app's local backend.

The Electron shell starts this (bundled by PyInstaller as soc-backend.exe) with:
    soc-backend.exe --port 47821 --frontend <dir with the built React UI>
plus the user's settings (API keys etc.) in environment variables. It serves the UI and the
/api routes from http://127.0.0.1:<port> — nothing is hosted online.
"""
import argparse
import logging
import os
import runpy
import sys
import threading
from pathlib import Path


def _base_dir() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("SOC_PORT", "47821")))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--frontend", default=os.environ.get("SOC_FRONTEND_DIR", ""))
    args = ap.parse_args()

    if args.frontend:
        os.environ["SOC_FRONTEND_DIR"] = args.frontend
    os.environ.setdefault("COOKIE_SECURE", "0")  # plain http on 127.0.0.1
    os.environ.setdefault("CORS_ORIGINS", f"http://127.0.0.1:{args.port},http://localhost:{args.port}")
    os.environ.setdefault("DB_NAME", "soc_interview_simulator")
    if not os.environ.get("JWT_SECRET"):
        os.environ["JWT_SECRET"] = "soc-desktop-local-secret-" + os.environ.get("COMPUTERNAME", "local").ljust(16, "x")

    base = _base_dir()
    sys.path.insert(0, str(base))
    os.chdir(base)

    # Billing switched on with a Stripe key → make sure the Pro price exists (same as setup_stripe.py).
    if os.environ.get("SOC_LOCAL_PRO", "1") != "1" and os.environ.get("STRIPE_SECRET_KEY"):
        def _stripe():
            try:
                runpy.run_path(str(base / "setup_stripe.py"), run_name="__main__")
            except Exception as e:  # never block the app on billing setup
                logging.getLogger("desktop").warning("Stripe setup skipped: %s", e)
        threading.Thread(target=_stripe, daemon=True).start()

    import uvicorn
    from server import app

    uvicorn.run(app, host=args.host, port=args.port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
