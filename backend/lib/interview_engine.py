"""INTERVIEW AI: builds the interviewer's context and decides the next conversational turn.

Every turn is: analyze the candidate's last answer -> choose an action (follow-up, challenge,
clarify, new seed question, wrap-up, answer candidate question, close) -> one spoken reply.
"""
import random

from lib.db import db
from lib.llm import llm_json

ROUND_META = {
    "hr": {"label": "HR Screening", "minutes": "10–20"},
    "technical": {"label": "Technical Interview", "minutes": "30–60"},
    "scenario": {"label": "SOC Investigation", "minutes": "20–45"},
    "manager": {"label": "Hiring Manager Interview", "minutes": "15–30"},
}

MODE_ROUNDS = {
    "full": [("hr", 5), ("technical", 7), ("scenario", 6), ("manager", 5)],
    "quick": [("technical", 4), ("scenario", 3)],
    "communication": [("hr", 6), ("manager", 4)],
    "technical": [("technical", 8), ("scenario", 6)],
}

ROUND_GOALS = {
    "hr": "Screen for communication, motivation, background, behavioral fit, certifications/home lab, shift availability and salary expectations. Start with 'tell me about yourself'. If the candidate provided a resume, ask at least two questions about specific named items on it (a job at a named employer, a certification, a project or home lab) and check that what they say matches. At the end ask if they have questions for you, answer naturally, then close with something like 'Thanks. I'll pass my notes along to the security team.'",
    "technical": "Assess technical depth for the level: networking, protocols, Windows/AD/Kerberos, SIEM/EDR, logs, phishing, malware, MITRE ATT&CK, cloud — weighted toward the company's stack and focus areas. Dig one level deeper on anything the candidate mentions. At the end briefly ask if they have questions, then close.",
    "scenario": "Run a live investigation. Early in the round (first or second turn), say you're sharing your screen and set show_evidence=true, then ask what stands out. Drive the conversation through the evidence: hypothesis, telemetry to collect, containment decision, MITRE mapping, scoping, documentation, escalation. Introduce realistic twists from the scenario notes when appropriate (changing information). Close the round when done.",
    "manager": "Assess judgment, prioritization, escalation, pressure, ethics, teamwork, business risk and executive communication. When finished say exactly in spirit: 'Those are all the questions I have. What questions do you have for me?' Answer the candidate's real questions naturally using the company details (invent plausible, consistent details about team, shifts, tooling, growth). Then close with: 'Thanks for taking the time to meet with us. Recruiting will follow up regarding next steps.'",
}

PENTEST_ROUND_META = {
    "hr": {"label": "HR Screening", "minutes": "10–20"},
    "technical": {"label": "Technical Interview", "minutes": "30–60"},
    "scenario": {"label": "Engagement Scenario", "minutes": "20–45"},
    "manager": {"label": "Hiring Manager Interview", "minutes": "15–30"},
}

PENTEST_ROUND_GOALS = {
    "hr": "Screen a penetration-testing candidate for communication, motivation, background, home lab / Hack The Box / TryHackMe practice, certifications (e.g. OSCP, PNPT, eJPT), report-writing experience, ethics and travel/consulting fit. Start with 'tell me about yourself'. If the candidate provided a resume, ask at least two questions about specific named items on it and check that what they say matches. At the end ask if they have questions for you, answer naturally, then close with something like 'Thanks. I'll pass my notes along to the offensive security team.'",
    "technical": "Assess offensive-security technical depth for the level: networking, scanning and enumeration (Nmap, service/version detection), web application testing (OWASP Top 10, Burp Suite, IDOR, SQLi, XSS, SSRF, JWT, APIs), Active Directory attacks (BloodHound, Kerberoasting, AS-REP, NTLM relay, delegation, AD CS), Linux/Windows privilege escalation, pivoting, and cloud/Kubernetes — weighted toward the company's stack. Always probe for safe, in-scope methodology and how they'd verify a finding. Dig one level deeper on anything the candidate mentions. At the end briefly ask if they have questions, then close.",
    "scenario": "Run a live engagement scenario. Set the scene as the client or engagement lead (scope, rules of engagement, time box, what's in and out of scope) using the company's real stack. Drive the candidate through it step by step: reconnaissance, prioritization, enumeration, exploitation decisions, privilege escalation, attack paths, impact validation, evidence collection, cleanup and reporting. Introduce realistic twists (an out-of-scope host, an unstable production service, discovered PII, signs of a real attacker, a client disputing severity) and check their judgment. Never set show_evidence. Close the round when done.",
    "manager": "Assess a penetration tester's judgment, client communication, severity vs business risk, report quality, ethics, handling disputes with developers or clients, mentoring and pressure. When finished say in spirit: 'Those are all the questions I have. What questions do you have for me?' Answer the candidate's real questions naturally using the company details (invent plausible, consistent details about the team, engagements, tooling, growth). Then close with: 'Thanks for taking the time to meet with us. Recruiting will follow up regarding next steps.'",
}

PENTEST_LEVELS = {"Junior Penetration Tester": "L1", "Penetration Tester": "L2", "Senior Penetration Tester": "L3"}


def track_of(position: str) -> str:
    return "pentest" if "Penetration" in position else "soc"


def round_meta(track: str) -> dict:
    return PENTEST_ROUND_META if track == "pentest" else ROUND_META


LEVEL_MAP = {**PENTEST_LEVELS, 
    "SOC Analyst L1": "L1", "SOC Analyst L2": "L2", "SOC Analyst L3": "L3",
    "Cybersecurity Analyst": "L1", "Security Analyst": "L1", "Security Operations Analyst": "L1",
    "Incident Response Analyst": "L2", "Threat Detection Analyst": "L2",
}
LEVEL_ORDER = {"L1": 1, "L2": 2, "L3": 3}


def soc_level(position: str, experience: str) -> str:
    lvl = LEVEL_MAP.get(position, "L1")
    if lvl == "L1" and position not in ("SOC Analyst L1", "Junior Penetration Tester") and experience in ("3–5 Years", "5+ Years"):
        lvl = "L2"
    return lvl


async def pick_seed_questions(user_id: str, round_type: str, level: str, n: int = 10, track: str = "soc",
                              focus: str | None = None) -> list[dict]:
    """Seeds come from the role's bank (SOC or Penetration Tester). With a technical focus (Splunk, Wireshark,
    Nmap, Active Directory, Python), technical/scenario rounds draw mostly from that tool's bank."""
    track_q = {"track": "pentest"} if track == "pentest" else {"track": {"$nin": ["pentest", "skills"]}}
    qs = await db.questions.find({"round": round_type, **track_q}, {"_id": 0}).to_list(2000)
    lv = LEVEL_ORDER[level]

    def fits(q: dict) -> bool:
        return q["soc_level"] == "All" or LEVEL_ORDER.get(q["soc_level"].rstrip("+"), 1) <= lv

    eligible = [q for q in qs if fits(q)]
    used = set(await db.responses.distinct("seed_question_id", {"user_id": user_id}))
    if focus and round_type in ("technical", "scenario"):
        fq = await db.questions.find({"track": "skills", "topic": focus}, {"_id": 0}).to_list(500)
        fq = [q for q in fq if fits(q)] or fq
        random.shuffle(fq)
        fq.sort(key=lambda q: q["id"] in used)
        random.shuffle(eligible)
        return (fq[: max(1, n - 2)] + eligible)[:n]
    fresh = [q for q in eligible if q["id"] not in used]
    rest = [q for q in eligible if q["id"] in used]
    random.shuffle(fresh)
    random.shuffle(rest)
    # weight toward the level's depth: L2/L3 prefer harder items
    pool = fresh + rest
    if lv >= 2:
        pool.sort(key=lambda q: 0 if q["difficulty"] != "beginner" else 1)
    return pool[:n]


def _system_prompt(iv: dict, rnd: dict, persona: dict, user: dict, seeds: list[dict], scenario: dict | None, weak_topics: list[str]) -> str:
    c = iv["company"]
    coach = iv.get("coach_mode")
    seed_lines = "\n".join(
        f"- [{q['id']}] {q['text']} | expected: {', '.join(q['expected_concepts'][:6])} | follow-ups: {' / '.join(q['follow_ups'][:3])}"
        for q in seeds
    )
    memory = "\n".join(f"- {m}" for m in iv.get("memory", [])[-25:]) or "- (nothing yet)"
    scen = ""
    if scenario:
        fields = "; ".join(f"{k}: {v}" for k, v in scenario["fields"])
        tree = " > ".join(f"{p['name']}" + (f" ({p.get('cmd','')[:60]})" if p.get("cmd") else "") for p in scenario.get("process_tree", []))
        scen = (f"\nSCENARIO EVIDENCE you will share on screen — {scenario['title']} [{scenario['severity']}] from {scenario['source']}:\n"
                f"{fields}\nProcess tree: {tree or 'n/a'}\nRaw: {scenario['raw_log'][:600]}\nMITRE (do NOT reveal): {', '.join(scenario['mitre'])}\n"
                f"Interviewer-only notes (never reveal): {scenario['interviewer_notes']}\n")
    resume = (user.get("resume_summary") or "").strip()
    track = track_of(iv["position"])
    goals = PENTEST_ROUND_GOALS if track == "pentest" else ROUND_GOALS
    return f"""You are {persona['name']}, {persona['title']} at {c['name']}. You are conducting a live video-call job interview — this is round "{round_meta(track)[rnd['type']]['label']}" for the position {iv['position']} ({iv['soc_level']}).

YOUR PERSONA: personality: {persona['personality']}. Speaking style: {persona['speaking_style']}. Focus areas: {', '.join(persona['focus'])}.

COMPANY: {c['name']} — {c['industry']}, ~{c['employees']:,} employees. SOC: {c['soc_description']}. Security stack: {', '.join(c['stack'])}. Industry focus areas you should weave into questions: {', '.join(c['focus'])}.

CANDIDATE: {user.get('name','the candidate')}. Self-reported experience: {iv['experience']}.
{('CANDIDATE RESUME (facts they submitted — reference specific jobs, employers, certifications, tools and projects from it naturally, e.g. "I see you worked at X — tell me about..."; probe claims for depth; never add facts not listed):' + chr(10) + resume) if resume else 'No resume provided — learn about their background by asking.'}

ROUND GOAL: {goals[rnd['type']]}
{('TECHNICAL FOCUS chosen by the candidate: ' + iv['focus'] + '. In this round most of your questions, follow-ups and any scenario should exercise hands-on ' + iv['focus'] + ' skills (real commands, queries, filters, fields, outputs), tied to the role.') if iv.get('focus') and rnd['type'] in ('technical', 'scenario') else ''}
Interview difficulty setting: {iv['difficulty']}. Current adaptive level: {rnd.get('adaptive', 0):+d} (range -2..+2). If the candidate answers fundamentals easily, raise depth; if they struggle, ask a clarifying or slightly simpler question before moving on. Never make the adjustment obvious.
{('Recurring weak topics from previous interviews (test them naturally, but still cover the full role): ' + ', '.join(weak_topics)) if weak_topics else ''}

THINGS THE CANDIDATE HAS SAID EARLIER (you may reference these naturally — "You mentioned earlier..."). NEVER invent claims beyond this list or the transcript:
{memory}

SEED QUESTIONS (inspiration — adapt wording to the company/stack; do not read them as a list; never reveal expected concepts):
{seed_lines}
{scen}
MODE: {'COACH MODE — still conduct a realistic interview; a separate coach gives feedback, so you do not teach or grade.' if coach else 'REAL INTERVIEW MODE — absolute professional neutrality.'}

CRITICAL RULES:
- You are speaking out loud on a call: 1–4 short natural sentences, contractions, no markdown, no lists, no emojis, no stage directions.
- Never reveal expected answers, never say "Correct!", never grade, hint or tutor. Avoid excessive praise; neutral acknowledgements like "Okay.", "Got it.", "Interesting." only when they fit.
- Analyze each answer: correct? complete? vague? interesting detail? wrong assumption? Then pick the best next move: follow-up ("Why?", "Walk me through your thinking", "What evidence supports that?", "How would you verify that?", "What would make you escalate this?"), challenge, clarify ("I'm not sure I follow — can you explain that differently?"), change the scenario, or move to a new topic. Use pressure moments sparingly and naturally.
- Do not repeat questions already asked. Do not ask unrelated random questions. Do not assume knowledge the candidate didn't state. Do not penalize accents or honest uncertainty.
- If the candidate asks you to repeat or clarify, do so briefly. If the candidate asks you a question, answer it naturally in character.
- Ask one question at a time.

OUTPUT: respond ONLY with a JSON object:
{{"analysis": {{"answer_quality": "strong|adequate|vague|weak|incorrect|off_topic|n/a", "notes": "short private note"}},
 "action": "greeting|follow_up|challenge|clarify|new_question|scenario_twist|wrap_up|answer_candidate_question|close",
 "say": "exactly what you say out loud",
 "seed_question_id": "q-xxx or null",
 "counts_as_main_question": true/false,
 "show_evidence": true/false,
 "round_complete": true/false,
 "new_memory": ["concise factual claims the candidate just made about themselves (tools, years, certs, projects) — empty if none"],
 "performance_signal": "up|down|steady"}}
Set round_complete=true only on your final goodbye line."""


async def next_turn(iv: dict, rnd: dict, persona: dict, user: dict, turns: list[dict], scenario: dict | None) -> dict:
    seeds_ids = rnd.get("seed_question_ids", [])
    seeds = await db.questions.find({"id": {"$in": seeds_ids}}, {"_id": 0}).to_list(50)
    weak = iv.get("weak_topics", [])
    system = _system_prompt(iv, rnd, persona, user, seeds, scenario, weak)
    asked = rnd.get("main_questions", 0)
    target = rnd.get("target_questions", 5)
    convo = "\n".join(f"{'YOU' if t['speaker'] == 'interviewer' else 'CANDIDATE'}: {t['text']}" for t in turns) or "(the call just started — candidate has joined)"
    if not turns:
        stage = "Open the round: greet the candidate by first name, introduce yourself and your role in one sentence, a touch of natural small talk, then ask your first question."
    elif asked >= target + 2:
        stage = "You are over time. Wrap up now: if you haven't, ask whether they have questions for you; otherwise close the round."
    elif asked >= target:
        stage = "You have covered enough main questions. Move toward wrap-up (questions for you, then goodbye) unless a critical follow-up is needed."
    else:
        stage = f"Main questions asked so far: {asked} of about {target}. Continue the interview."
    evidence_note = "Evidence is already on screen." if rnd.get("evidence_shown") else ("Evidence not yet shared." if scenario else "")
    prompt = f"TRANSCRIPT OF THIS ROUND SO FAR:\n{convo}\n\nSTAGE: {stage} {evidence_note}\nReturn the JSON for your next turn."
    out = await llm_json(system, prompt)
    out["say"] = (out.get("say") or "Could you say a bit more about that?").strip()
    return out
