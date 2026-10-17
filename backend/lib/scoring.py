"""SCORING ENGINE: two independent systems — job readiness (technical) and professional communication.

Audio-derived metrics (pace, fillers, clarity, pauses) are measured here; the LLM judges content,
grammar, structure and gives coaching. Final hiring decision is holistic, not an average.
"""
from lib.llm import llm_json

TECH_TOPICS = ["Networking", "Windows", "Linux", "Active Directory", "SIEM", "EDR", "Incident Response",
               "Threat Hunting", "Threat Intelligence", "Malware", "Phishing", "Cloud", "IAM", "MITRE ATT&CK",
               "Log Analysis", "Detection Engineering", "Behavioral", "Career & Motivation", "Judgment & Leadership"]
COMM_DIMS = ["grammar", "fluency", "confidence", "vocabulary", "structure", "conciseness",
             "technical_explanation", "behavioral", "professionalism"]
PRACTICE_MODULES = ["tell_me_about_yourself", "behavioral_star", "technical_explanation",
                    "non_technical_audience", "pronunciation", "rapid_interview"]


def clean_eval(a: dict) -> dict:
    """Coerce LLM output so Evaluation validates: null/str scores -> float, null lists -> []."""
    out = dict(a)
    for k in ("technical_score", "communication_score", "technical_communication"):
        try:
            out[k] = float(out.get(k) or 0)
        except (TypeError, ValueError):
            out[k] = 0.0
    for k in ("grammar", "did_well", "improve", "missing_concepts", "study_topics"):
        if not isinstance(out.get(k), list):
            out[k] = []
    out["grammar"] = [g for g in out["grammar"] if isinstance(g, dict) and g.get("said") and g.get("better")]
    for k in ("topic", "pronunciation_note", "fluency_note", "confidence_note", "structure_note", "conciseness_note", "stronger_answer"):
        out[k] = str(out.get(k) or "")
    out["evaluable"] = out.get("evaluable") is not False
    return out


def pace_score(wpm: float | None) -> float | None:
    if not wpm:
        return None
    if 115 <= wpm <= 165:
        return 100.0
    gap = (115 - wpm) if wpm < 115 else (wpm - 165)
    return max(30.0, 100 - gap * 1.2)


def filler_score(fillers: dict, words: int) -> float:
    if words <= 0:
        return 100.0
    rate = sum(fillers.values()) / words * 100
    return max(20.0, 100 - max(0.0, rate - 1.5) * 12)


def audio_metrics_line(r: dict) -> str:
    return (f"duration {r.get('duration', 0):.0f}s, ~{r.get('wpm') or 0:.0f} wpm, fillers {r.get('fillers') or {}}, "
            f"long pauses {r.get('long_pauses', 0)}, speech-recognition clarity {r.get('clarity') if r.get('clarity') is not None else 'n/a (typed)'}")


EVAL_FIELDS = """{"response_id": "...", "evaluable": true/false (false for small talk / candidate's own questions / greetings),
 "topic": one of %s,
 "technical_score": 0-100 (accuracy, depth, methodology, judgment for the role level; for behavioral questions judge substance/judgment),
 "communication_score": 0-100 (how clearly and professionally it was communicated — independent of technical correctness),
 "technical_communication": 0-100 (how well technical ideas were explained/sequenced),
 "comm_dims": {%s: 0-100 each},
 "grammar": [{"said": "exact phrase", "better": "natural professional phrasing", "why": "brief reason"}] (0-3 meaningful issues only),
 "pronunciation_note": "based only on the clarity metric and any garbled/misrecognized words; never comment on accent",
 "fluency_note": "...", "confidence_note": "...", "structure_note": "(STAR for behavioral; identify→investigate→validate→contain/escalate→document for investigations when appropriate)",
 "conciseness_note": "...", "did_well": ["..."], "improve": ["..."],
 "stronger_answer": "a stronger professional spoken version in the candidate's voice, <=110 words, honest — never adds experience they did not claim",
 "missing_concepts": ["..."], "study_topics": ["..."]}""" % (TECH_TOPICS, ", ".join(f'"{d}"' for d in COMM_DIMS))

EVAL_SYSTEM = """You are an expert SOC hiring evaluator and professional American English communication coach.
Score TECHNICAL KNOWLEDGE and COMMUNICATION as separate, independent systems — a technically excellent answer can communicate poorly and vice versa.
Never penalize accents or non-American pronunciation; focus on clarity and intelligibility. Do not penalize honest, professionally-stated uncertainty.
Prioritize meaningful grammar corrections; do not nitpick. Be specific and practical. Respond ONLY with JSON."""


async def evaluate_responses(context: str, items: list[dict]) -> dict:
    """items: [{id, question, transcript, seed (optional), metrics}] -> {"answers": [...], "round_score", "round_summary"}"""
    blocks = []
    for it in items:
        seed = it.get("seed")
        seed_txt = f"\nExpected concepts: {', '.join(seed['expected_concepts'])}\nRubric: {seed['rubric']}" if seed else ""
        blocks.append(f"[response_id={it['id']}]\nINTERVIEWER: {it['question']}\nCANDIDATE: {it['transcript']}\nAUDIO METRICS: {it['metrics']}{seed_txt}")
    prompt = (f"{context}\n\nEvaluate each candidate response below.\n\n" + "\n\n".join(blocks) +
              f"\n\nReturn JSON: {{\"answers\": [{EVAL_FIELDS}], \"round_score\": 0-100 overall performance in this round, \"round_summary\": \"2-3 sentence evaluator note\"}}")
    return await llm_json(EVAL_SYSTEM, prompt)


async def final_decision(context: str, stats: str) -> dict:
    prompt = f"""{context}

AGGREGATED EVIDENCE:
{stats}

Make a realistic hiring decision for this role level. Do NOT base it only on averages: weigh role level, severity of knowledge gaps, investigation methodology, judgment, professionalism, consistency and critical mistakes.
Return JSON:
{{"decision": "STRONG HIRE|HIRE|BORDERLINE|NO HIRE",
 "job_readiness": 0-100, "communication": 0-100,
 "decision_reasoning": "why the candidate was / was not hired (3-5 sentences)",
 "strengths": ["4-6 specific strengths"], "weaknesses": ["4-6 specific weaknesses"],
 "hiring_summary": "a realistic short hiring-manager evaluation note written by the hiring manager (4-6 sentences)",
 "priorities": [{{"title": "...", "why": "...", "module": one of {PRACTICE_MODULES}}}] (exactly 5, ordered)}}"""
    return await llm_json("You are the hiring committee for a SOC team. Be fair, realistic and specific. Respond ONLY with JSON.", prompt)
