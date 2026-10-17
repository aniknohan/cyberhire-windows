"""Dashboards: overview, communication skills, technical skills, progress over time."""
from collections import Counter

from fastapi import APIRouter, Depends

from lib.auth import current_user
from lib.db import db
from models.schemas import CommStats, DimStat, Overview, ProgressPoint, SkillScore, TechStats, TopicStat
from routers.interviews import _avg, _aware, list_interviews

router = APIRouter(prefix="/stats", tags=["stats"])

COMM_LABELS = {
    "grammar": "Grammar", "pronunciation_clarity": "Pronunciation Clarity", "fluency": "Fluency", "confidence": "Confidence",
    "vocabulary": "Professional Vocabulary", "speaking_pace": "Speaking Pace", "filler_words": "Filler Words",
    "structure": "Answer Structure", "technical_explanation": "Technical Communication",
    "behavioral": "Behavioral Communication", "conciseness": "Conciseness", "professionalism": "Professionalism",
}
TECH_TOPICS = ["Networking", "Windows", "Linux", "Active Directory", "SIEM", "EDR", "Incident Response", "Threat Hunting",
               "Threat Intelligence", "Malware", "Phishing", "Cloud", "IAM", "MITRE ATT&CK", "Log Analysis", "Detection Engineering"]


async def _completed(uid: str) -> list[dict]:
    return await db.interviews.find({"user_id": uid, "status": "completed"}, {"_id": 0}).sort("created_at", 1).to_list(500)


@router.get("/overview", response_model=Overview)
async def overview(user: dict = Depends(current_user)):
    ivs = await _completed(user["id"])
    reps = [iv["report"] for iv in ivs if iv.get("report")]
    rs = await db.responses.find({"user_id": user["id"], "evaluation": {"$ne": None}}, {"_id": 0, "evaluation": 1}).to_list(5000)
    evs = [r["evaluation"] for r in rs if r["evaluation"].get("evaluable", True)]
    skills: dict[str, list[float]] = {}
    for e in evs:
        if e.get("topic"):
            skills.setdefault(e["topic"], []).append(e["technical_score"])
        for k, v in (e.get("comm_dims") or {}).items():
            if k in COMM_LABELS:
                skills.setdefault(COMM_LABELS[k], []).append(v)
    ranked = sorted([SkillScore(name=k, score=_avg(v)) for k, v in skills.items() if len(v) >= 1], key=lambda s: s.score, reverse=True)
    summaries = await list_interviews(user)
    recent5 = reps[-5:]
    total_secs = 0.0
    for s in summaries:
        total_secs += s.duration_seconds
    return Overview(
        total_interviews=len(ivs), interview_hours=round(total_secs / 3600, 2),
        hiring_rate=round(100 * sum(1 for r in reps if r["decision"] in ("HIRE", "STRONG HIRE")) / len(reps), 1) if reps else None,
        questions_answered=await db.responses.count_documents({"user_id": user["id"]}),
        job_readiness=_avg([r["job_readiness"] for r in recent5]), communication_readiness=_avg([r["communication"] for r in recent5]),
        technical_score=_avg([e["technical_score"] for e in evs]), communication_score=_avg([e["communication_score"] for e in evs]),
        strongest=ranked[:4], weakest=list(reversed(ranked[-4:])) if len(ranked) > 4 else [],
        recent=summaries[:5],
        progress=[ProgressPoint(n=i + 1, interview_id=iv["id"], date=_aware(iv["created_at"]), technical=iv["report"]["job_readiness"],
                                communication=iv["report"]["communication"], decision=iv["report"]["decision"])
                  for i, iv in enumerate(ivs) if iv.get("report")],
        priorities=(reps[-1].get("priorities") or []) if reps else [],
    )


@router.get("/communication", response_model=CommStats)
async def communication(user: dict = Depends(current_user)):
    ivs = await _completed(user["id"])
    labels, series, fillers, wpms = [], {k: [] for k in COMM_LABELS}, [], []
    breakdown = Counter()
    for i, iv in enumerate(ivs):
        rep = iv.get("report") or {}
        labels.append(f"#{i + 1}")
        for k in COMM_LABELS:
            series[k].append(rep.get("comm_dims", {}).get(k))
        fillers.append(float(rep.get("filler_total", 0)))
        wpms.append(rep.get("avg_wpm"))
        breakdown.update(rep.get("filler_breakdown") or {})
    dims = [DimStat(key=k, label=lbl, current=next((v for v in reversed(series[k]) if v is not None), None),
                    average=_avg(series[k]), series=series[k]) for k, lbl in COMM_LABELS.items()]
    return CommStats(dims=dims, labels=labels, filler_series=fillers, wpm_series=wpms, filler_breakdown=dict(breakdown),
                     practice_count=await db.practice_sessions.count_documents({"user_id": user["id"]}))


@router.get("/technical", response_model=TechStats)
async def technical(user: dict = Depends(current_user)):
    rs = await db.responses.find({"user_id": user["id"], "evaluation": {"$ne": None}}, {"_id": 0, "evaluation": 1}).sort("created_at", 1).to_list(5000)
    by: dict[str, list[dict]] = {}
    for r in rs:
        e = r["evaluation"]
        if e.get("evaluable", True) and e.get("topic"):
            by.setdefault(e["topic"], []).append(e)
    out = []
    for t in TECH_TOPICS:
        es = by.get(t, [])
        scores = [e["technical_score"] for e in es]
        cur = _avg(scores[-5:])
        trend = round(_avg(scores[-3:]) - _avg(scores[:3]), 1) if len(scores) >= 4 else None
        missing = Counter(m for e in es for m in e.get("missing_concepts", [])).most_common(4)
        out.append(TopicStat(topic=t, current=cur, trend=trend, answered=len(es), weak=cur is not None and cur < 65,
                             missing=[m for m, _ in missing]))
    return TechStats(topics=out)
