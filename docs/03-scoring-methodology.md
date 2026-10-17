# 03 — Scoring Methodology

CyberHire scores two things **independently**:

- **Job readiness (technical):** is the answer correct, complete and methodical for the role level?
- **Professional communication:** was it explained clearly, confidently and professionally?

A technically excellent answer can still be communicated poorly, and a polished answer can be technically wrong. Keeping the two scores separate tells candidates which one to work on.

## 1. Measured from the audio

These metrics are calculated from the recording and transcript, not judged by the AI:

| Metric | How it's measured | Scoring |
|---|---|---|
| **Speaking pace** | Words ÷ Whisper speech duration, in words per minute | 100 between 115–165 wpm; −1.2 points per wpm outside that range (minimum 30) |
| **Filler words** | Counts of *um, uh, like, you know, basically, actually, so, I mean* per 100 words. The patterns are context-aware, so for example "you know how…" doesn't count | Up to 1.5 per 100 words is free; −12 points per extra filler per 100 words (minimum 20) |
| **Pronunciation clarity** | Mean Whisper segment log-probability, mapped with `100 · e^(0.9 · avg_logprob)` | Higher means the speech was recognised confidently; never used to judge accent |
| **Long pauses** | Gaps over 2 seconds between speech segments | Reported as a count |

Whisper is prompted with a verbatim-style example ("Umm, so, uh…") so it keeps filler words instead of cleaning them out, and with security vocabulary (SIEM, EDR, Kerberos, PowerShell, MITRE ATT&CK) so technical terms are recognised correctly.

## 2. Judged by the grader model

At the end of each round, every answer is sent to the grader together with:

- the question, and the candidate's transcript;
- the audio metrics above;
- for seeded questions, the **expected concepts** and the **rubric** from the question bank:
  - *Strong (85+):* covers most expected points in a logical order with accurate terminology.
  - *Adequate (60–84):* correct core idea, missing depth or structure.
  - *Weak (<60):* vague, incorrect or off-question.

For each answer the grader returns:

- `technical_score`, `communication_score` and `technical_communication` (0–100);
- communication dimensions: grammar, fluency, confidence, vocabulary, structure, conciseness, technical explanation, behavioural and professionalism;
- up to 3 meaningful grammar corrections (what was said, a more natural professional phrasing, and why);
- a structure check: **STAR** for behavioural answers, and *identify → investigate → validate → contain/escalate → document* for investigations;
- what went well, what to improve, missing concepts and study topics;
- a **stronger answer** of up to 110 words, written in the candidate's own voice, that never adds experience they didn't claim.

Grader guardrails: never penalise accents, never penalise honest and professionally stated uncertainty, and don't nitpick grammar.

## 3. Hiring decision

At the end of the interview, the hiring committee prompt receives the aggregated evidence and makes a **holistic** decision rather than averaging scores. It weighs the role level, how serious the knowledge gaps are, investigation methodology, judgement, professionalism, consistency and any critical mistakes. It returns:

- **Decision:** STRONG HIRE · HIRE · BORDERLINE · NO HIRE
- Job readiness and communication scores
- Decision reasoning, 4–6 strengths, 4–6 weaknesses and a hiring manager's note
- A **5-step development plan**, each step linked to a practice module

## 4. Progress over time

The dashboard aggregates every completed interview:

- job readiness and communication trends;
- strongest and weakest technical topics (Networking, Windows, Linux, Active Directory, SIEM, EDR, Incident Response, Threat Hunting, Threat Intelligence, Malware, Phishing, Cloud, IAM, MITRE ATT&CK, Log Analysis, Detection Engineering, and others);
- recurring weak topics, which future interviewers deliberately revisit.
