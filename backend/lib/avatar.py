"""AVATAR/VIDEO ENGINE boundary.

The interview AI and voice engine never talk to the avatar layer directly; the frontend asks
this module which provider is active. Today only the 'portrait' fallback is live (professional
portrait + speaking/listening animation driven by the TTS audio level). A real-time provider
(HeyGen, Tavus, D-ID…) plugs in by setting AVATAR_PROVIDER + its key in backend/.env and
implementing create_session() below — no change to the interview engine is needed.
"""
import os

PROVIDERS = [
    {"id": "portrait", "name": "Portrait + audio-reactive animation", "env_key": None},
    {"id": "heygen", "name": "HeyGen Interactive Avatar", "env_key": "HEYGEN_API_KEY"},
    {"id": "tavus", "name": "Tavus Conversational Video", "env_key": "TAVUS_API_KEY"},
    {"id": "did", "name": "D-ID Agents", "env_key": "DID_API_KEY"},
]


def config() -> dict:
    active = os.environ.get("AVATAR_PROVIDER", "portrait")
    out = []
    for p in PROVIDERS:
        if p["env_key"] is None:
            status = "active" if active == "portrait" else "available"
        else:
            # Integration adapters are not implemented yet; a key alone does not make it live.
            status = "key_present_adapter_pending" if os.environ.get(p["env_key"]) else "not_configured"
        out.append({"id": p["id"], "name": p["name"], "status": status})
    return {"active_provider": "portrait", "live_avatar_available": False, "lip_sync": False, "providers": out}
