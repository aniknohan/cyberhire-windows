# CyberHire: free AI interview simulator for Windows and Android

**CyberHire is free.** There are no subscriptions, no trial and no account with us. Every feature is unlocked.
You bring your own AI key (OpenAI and/or Anthropic) and pay the AI company directly for what you use,
usually a few cents per interview. Your key and your data stay on your own computer or phone.

Practice realistic cybersecurity job interviews with AI interviewers. You get the HR, technical, SOC investigation
and hiring manager rounds, spoken questions and voice answers, scoring and reports, drills and coach mode.

## Download

Go to **[Releases](https://github.com/aniknohan/cyberhire-windows/releases)** and pick:

| Device | File |
|---|---|
| Windows (installs with Start menu + desktop shortcut) | `CyberHire-Setup-<version>.exe` |
| Windows (no install, just run it) | `CyberHire-Portable-<version>.exe` |
| Android phone | `CyberHire-Android.apk` |

iPhone / iPad are not supported.

## Get an AI key (needed once)

| Key | What it gives you |
|---|---|
| **OpenAI**, recommended | Everything: interviewer, scoring, realistic interviewer voices, answering out loud, pronunciation and pace scores |
| **Anthropic** (Claude), optional | Interviewer and scoring run on Claude Sonnet 4.5. Voice features still need an OpenAI key. |

**OpenAI:** sign in at [platform.openai.com](https://platform.openai.com) → **Settings → Billing** → add credit ($5 is enough for many
interviews) → **API keys** → **Create new secret key** → copy it. A ChatGPT Plus subscription is *not* the same thing; the API
needs its own credit.

**Anthropic:** [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) (also needs credit added).

Never share your key with anyone. CyberHire only sends it to OpenAI / Anthropic.

## Windows: first start
1. Run the installer. If Windows shows "Windows protected your PC", click **More info → Run anyway** (the app isn't code-signed).
2. The Settings window opens. Click **Paste** next to the OpenAI key, then **Test**, then **Save & restart engine**.
3. Sign up with any email and password. It's a local account that exists only on your PC. Then start an interview.
4. Camera or mic not working? Go to Windows **Settings → Privacy & security → Camera** and **Microphone**, and turn on
   "Let desktop apps access…".

Your interviews, reports and recordings are saved in `%APPDATA%\CyberHire` (App menu → *Open data folder*).

## Android: first start
1. Download `CyberHire-Android.apk` on your phone and open it. Allow installs from that app when Android asks.
2. If Play Protect warns you, tap **More details → Install anyway** (the app isn't from the Play Store).
3. Open CyberHire and allow **Camera** and **Microphone**.
4. Settings opens: tap **Paste**, then **Test**, then **Save**.

Everything is saved only on your phone. New versions install over the old one and keep your history.

## What it costs
CyberHire itself costs nothing. The AI company charges your key per use. A typical full interview with voices costs
roughly $0.05–$0.20; typed-only practice costs less.

## For developers
- `frontend/`: React screens
- `backend/`: FastAPI engine with a built-in local database (`lib/localdb.py`) and direct AI calls (`lib/llm.py`, `lib/voice.py`)
- `electron/`: the Windows app window, Settings screen, and camera/mic permissions
- `android-app/`: the standalone Android app (Capacitor)
- `.github/workflows/`: cloud builds for the Windows `.exe` and the Android `.apk` (every push to `main` publishes a release)
- `build-windows.bat`: build the Windows app locally (needs Node.js 22 and Python 3.12)
