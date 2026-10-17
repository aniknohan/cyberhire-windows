# 02 — Interview Engine

The interview engine (`backend/lib/interview_engine.py` on Windows, the same design in the Android app) turns a large language model into a believable interview panel. It does not just read questions from a list: each turn, the interviewer analyses the last answer and decides what a real interviewer would do next.

## The hiring loop

| Round | Interviewers | Goal |
|---|---|---|
| **HR Screening** | Jessica Morgan (Technical Recruiter), Priya Patel (Senior Talent Partner) | Motivation, career story, behavioural STAR answers, professionalism |
| **Technical** | David Chen (Senior SOC Analyst), Elena Rostova (Cloud Security Engineer) | Fundamentals and depth: networking, Windows, Active Directory, SIEM, EDR, cloud and IAM |
| **SOC Investigation** | Marcus Williams (Incident Response Lead), Raj Mehta (Threat Hunting Lead) | A live alert with evidence on screen: hypothesis, telemetry, containment, MITRE mapping, scoping, escalation |
| **Hiring Manager** | Sarah Thompson (SOC Manager), James O'Connor (Director of Security Operations) | Judgement, communication with stakeholders, culture and team fit |

Each persona has its own personality, speaking style, focus areas and a distinct synthetic voice.

### Interview modes

| Mode | Rounds (questions per round) |
|---|---|
| Full Interview | HR (5) → Technical (7) → Investigation (6) → Hiring Manager (5) |
| Quick Interview | Technical (4) → Investigation (3) |
| Communication focus | HR (6) → Hiring Manager (4) |
| Technical focus | Technical (8) → Investigation (6) |

## Configuring an interview

- **Position:** SOC Analyst L1 / L2 / L3, Cybersecurity Analyst, Security Analyst, Security Operations Analyst, Incident Response Analyst or Threat Detection Analyst. Each maps to an expected level (L1–L3) that controls question selection and grading expectations.
- **Difficulty:** Beginner, Intermediate, Advanced, Realistic / Adaptive, or Hard Mode.
- **Company environment:** Financial, Healthcare, Technology, Government Contractor, Enterprise, MSSP, Startup or random. A fictional company is generated with its size, SOC description, security stack and industry focus, and interviewers weave that stack into their questions.
- **Technical focus:** General, Splunk, Wireshark, Nmap, Active Directory or Python. With a focus selected, the technical and investigation rounds concentrate on hands-on use of that tool (queries, filters, commands and output).
- **Experience type:** *Real Interview* (neutral, no feedback until the end) or *Coach* (instant feedback and retries).

## How a turn works

For every turn, the interviewer model receives:

1. **Persona and company context:** who they are, the company's stack and the round goal.
2. **Seed questions:** 6–8 questions drawn from the question bank for this round, level and focus, with their expected concepts and follow-ups. The interviewer adapts their wording and never reveals the expected answers.
3. **Candidate memory:** facts the candidate stated earlier (tools, certifications, years, projects), so the interviewer can say "You mentioned earlier…" without inventing anything.
4. **Adaptive level** (−2 to +2): raised when fundamentals come easily, lowered (with a clarifying question) when the candidate struggles. The adjustment is never made obvious.
5. **Recurring weak topics** from previous interviews, tested naturally.
6. **The conversation so far.**

The model must reply with structured JSON:

```json
{
  "analysis": {"answer_quality": "strong|adequate|vague|weak|incorrect|off_topic|n/a", "notes": "private note"},
  "action": "greeting|follow_up|challenge|clarify|new_question|scenario_twist|wrap_up|answer_candidate_question|close",
  "say": "what the interviewer says out loud",
  "seed_question_id": "q-xxx or null",
  "counts_as_main_question": true,
  "show_evidence": false,
  "round_complete": false,
  "new_memory": ["candidate claims to remember"],
  "performance_signal": "up|down|steady"
}
```

Rules in the system prompt keep the interviewer realistic: speak in 1–4 short sentences, ask one question at a time, never say "Correct!", never tutor in Real Interview mode, never penalise accents or honest uncertainty, and never repeat a question. The engine tracks main questions against the round target and moves the interviewer to wrap up when time runs over.

## Investigation scenarios

The SOC Investigation round shares evidence on screen, including alert fields, a process tree and raw log lines, and drives the candidate through triage. Included scenarios:

- Suspicious PowerShell Execution
- Password Spray Followed by Successful Login
- Ransomware Precursor Activity on a File Server
- Reported Phishing Email: CEO Wire Request
- Periodic DNS Beaconing from a Workstation

Each scenario has a severity, source, MITRE ATT&CK techniques and interviewer-only notes. The notes contain twists (changing information) that the interviewer introduces mid-investigation to test judgement. The MITRE mapping is hidden so the candidate has to supply it.

## Resume-aware interviews (Windows)

On Windows, a candidate can upload their resume. Its summary is added to the interviewer context, so questions reference the candidate's real employers, certifications and projects and probe their claims for depth. The interviewer is instructed never to add facts the resume doesn't contain.
