"""Where the desktop app keeps its data (database + answer recordings).

The Windows app passes SOC_DATA_DIR (its per-user app-data folder). When run by hand the
data goes next to the backend so nothing is written anywhere unexpected.
"""
import os
import sys
from pathlib import Path

if getattr(sys, "frozen", False):  # PyInstaller bundle: code lives in a temp/readonly dir
    _default = Path(os.environ.get("APPDATA") or Path.home()) / "CyberHire"
else:
    _default = Path(__file__).resolve().parent.parent / "local-data"

DATA_DIR = Path(os.environ.get("SOC_DATA_DIR") or _default)
DATA_DIR.mkdir(parents=True, exist_ok=True)
