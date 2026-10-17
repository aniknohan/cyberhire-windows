"""Build step: download the interviewer portraits and sign-in photo into the app so they show
without the internet. Any image that can't be downloaded keeps its original web address."""
import hashlib
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "portraits"
FILES = [ROOT / "backend" / "lib" / "seed_data.py", ROOT / "frontend" / "src" / "pages" / "AuthPage.tsx"]
URL = re.compile(r"https://images\.(?:unsplash|pexels)\.com/[^\"'\s)]+")

OUT.mkdir(parents=True, exist_ok=True)
done = failed = 0
for f in FILES:
    text = f.read_text(encoding="utf-8")
    for url in sorted(set(URL.findall(text))):
        name = hashlib.sha1(url.encode()).hexdigest()[:16] + ".jpg"
        dest = OUT / name
        try:
            if not dest.exists():
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                if len(data) < 2000:
                    raise ValueError("too small")
                dest.write_bytes(data)
            text = text.replace(url, f"/portraits/{name}")
            done += 1
        except Exception as e:  # keep the web URL for this one
            print(f"skip {url}: {e}", file=sys.stderr)
            failed += 1
    f.write_text(text, encoding="utf-8")
print(f"bundled {done} images, {failed} left online")
