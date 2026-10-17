# CyberHire — Windows desktop app (not web-based)

This is your CyberHire app — same screens, interviewers (SOC and Penetration Tester tracks), Technical focus
(Splunk, Wireshark, Nmap, Active Directory, Python), rounds, scoring, reports, drills, coach mode and admin tools —
packaged as a **standalone Windows app**. Nothing is hosted online:

- The app's own engine (`soc-backend.exe`) runs inside the app on your PC and serves the screens.
- Accounts, interviews, reports, drills and answer recordings are saved on your PC in
  `%APPDATA%\CyberHire` (App menu → *Open data folder*).
- Interviewer photos are built into the app.
- The only internet use is the AI itself: the interviewer brain (Claude Sonnet 4.5 → GPT-5.2 fallback),
  interviewer voices and speech recognition, called directly with **your own API keys**.

## What changed compared with the website
| Website | Windows app |
|---|---|
| MongoDB server | Built-in local database file (no install) |
| Emergent universal LLM key | Your OpenAI key (required) + Anthropic key (optional) — entered in **App → Settings & API keys** |
| 3-day trial, then $19.99/month or $159/year | Pro unlocked for every account on the PC (toggle in Settings to bring back the trial + Stripe/PayPal) |
| Your question banks | Same banks, with 96 repeated questions removed from the SOC and tools/Python banks (`backend/data/removed_duplicates.json`); the penetration tester bank is unchanged |
| Everything else | Identical — same React screens and same Python backend code |

## Get the .exe — option A: GitHub (free, no installs on your PC, ~15 min)
1. Create a free account at github.com → **+** → **New repository** → name it → **Private** → **Create**.
2. Click **uploading an existing file** and drag **everything inside this folder** in (include the hidden
   `.github` folder: File Explorer → View → Show → Hidden items). **Commit changes**.
3. Open the **Actions** tab (enable Actions if asked). *Build CyberHire for Windows* runs by itself (~10–15 min).
4. When it's green, open **Releases** on the repository page and download:
   - `CyberHire-Setup-1.0.0.exe` — installer (Start menu + desktop shortcut)
   - `CyberHire-Portable-1.0.0.exe` — runs without installing

If `.github` didn't upload: Actions → *set up a workflow yourself* → paste `.github/workflows/build-windows.yml` → Commit.

## Get the .exe — option B: build on your own Windows PC
1. Install **Node.js 22 LTS** (nodejs.org) and **Python 3.12** (python.org — tick *Add python.exe to PATH*).
2. Double-click `build-windows.bat`. The installers appear in the `dist` folder.

## First start
1. Run the installer. If Windows shows "Windows protected your PC": **More info → Run anyway** (the app isn't code-signed).
2. The Settings window opens: paste your **OpenAI API key** (platform.openai.com/api-keys), optionally your
   **Anthropic API key**, press **Test**, then **Save & restart engine**.
3. Sign up (or log in as admin: `admin@socsim.com` / `Admin@123`) and start an interview.
4. Camera/mic not working? Windows **Settings → Privacy & security → Camera** and **Microphone** →
   turn on "Let desktop apps access…".

## Folder layout
- `frontend/` – the React app (unchanged screens)
- `backend/` – the FastAPI app; `lib/localdb.py` (local database), `lib/llm.py` / `lib/voice.py` (direct AI calls), `desktop_server.py` (entry point), `soc-backend.spec` (PyInstaller)
- `electron/` – the Windows window, Settings screen, camera/mic permissions, starts/stops the engine
- `.github/workflows/build-windows.yml` – cloud build; `build-windows.bat` – local build
