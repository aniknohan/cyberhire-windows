# PyInstaller recipe for the desktop app's local backend → dist/soc-backend/soc-backend.exe
# Build:  pyinstaller --noconfirm soc-backend.spec
from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

hidden = (
    collect_submodules("uvicorn")
    + ["server", "lib.localdb", "lib.paths", "passlib.handlers.bcrypt", "bcrypt", "email_validator", "multipart", "python_multipart", "tzdata"]
)
datas = [("data", "data"), ("setup_stripe.py", ".")]
datas += collect_data_files("stripe") + collect_data_files("tzdata") + collect_data_files("certifi")
for pkg in ("email-validator", "fastapi", "pydantic", "uvicorn", "starlette", "stripe", "httpx", "pypdf"):
    try:
        datas += copy_metadata(pkg)
    except Exception:
        pass

a = Analysis(
    ["desktop_server.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    excludes=["tkinter", "matplotlib", "numpy", "pandas", "pytest", "IPython"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="soc-backend",
    console=True,  # the desktop app starts it hidden (windowsHide) and captures its log
    icon="../build/icon.ico",
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="soc-backend")
