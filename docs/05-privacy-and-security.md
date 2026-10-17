# 05 — Privacy & Security

CyberHire handles sensitive material: voice recordings, camera access, resumes and paid API keys. It was designed so that none of it leaves the user's device except the minimum needed to call the AI provider the user chose.

## Bring your own key

- There is **no CyberHire server, account system or subscription**. The app is free.
- Each user enters their own OpenAI and/or Anthropic API key and is billed by that provider directly.
- Keys are sent only to `api.openai.com` / `api.anthropic.com` over HTTPS. They are never included in builds, logs or the repository.

## Data flow

| Data | Where it goes |
|---|---|
| API keys | Stored on the device (encrypted on Windows) → sent only to the AI provider |
| Interview text and answers | Sent to the AI provider to generate the next question and the scores → results saved on the device |
| Voice recordings | Sent to OpenAI Whisper for transcription → saved on the device (Windows) |
| Camera video | **Never leaves the device.** It's shown only as your self-view, like a real video call |
| Resume (Windows) | A summary is added to the interviewer context → stored on the device |
| Analytics / telemetry | **None** |

## Windows protections

- **Encrypted key storage:** API keys are encrypted with Electron `safeStorage`, which uses **Windows DPAPI** and is tied to the Windows user account, so the settings file can't be read on another machine or by another user.
- **Loopback-only engine:** the FastAPI engine binds to `127.0.0.1`, so it's never reachable from the network.
- **Renderer hardening:** app windows run with `sandbox: true` and `contextIsolation: true`, and only expose a minimal preload API.
- **Scoped permissions:** camera and microphone requests are granted only to the app's own pages; every other permission is denied.
- **External links** open in the system browser rather than inside the app.
- **Local data folder:** everything lives in `%APPDATA%\CyberHire` (App menu → *Open data folder*), so it's easy to back up or delete.

## Android protections

- Everything is stored in the app's private storage. Other apps can't read it, and uninstalling the app deletes it.
- Camera and microphone are requested at runtime and can be revoked in Android settings at any time.
- The app loads from a secure local origin and makes no requests to third-party servers other than the AI providers.

## AI safety and fairness

- Graders are told to **never penalise accents** or non-American pronunciation. "Pronunciation" measures how clearly speech was recognised, not how the candidate sounds.
- Honest, professionally stated uncertainty ("I'm not sure, but I'd verify by…") is not penalised.
- Model answers never invent experience the candidate didn't claim.

## Known limitations

- The Windows installer and the Android APK are not code-signed by a commercial certificate, so Windows SmartScreen and Google Play Protect show warnings on first install.
- Anyone who can use the device can use the stored API key. Users should set a spending limit in their OpenAI / Anthropic billing settings.
