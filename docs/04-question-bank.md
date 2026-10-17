# 04 — Question Bank

Interviewers draw their seed questions from a structured bank of **638 SOC interview questions**. The questions are inspiration, not a script: interviewers rephrase them for the generated company's stack and follow up on the candidate's answers.

## Sources

| Source | Questions | Covers |
|---|---|---|
| Core interview bank | 223 | Behavioural and career questions, SOC fundamentals, investigation scenarios, hiring-manager judgement |
| SOC Analyst 200 | 153 | Alert triage, SIEM, EDR, Windows and Linux logs, incident response, threat intelligence, MITRE ATT&CK |
| Tools 200 | 168 | Hands-on Splunk (SPL), Wireshark (filters, PCAP analysis), Nmap (scans, NSE) and Active Directory (Kerberos, GPO, attacks) |
| Python for Cybersecurity 100 | 94 | Automation, log parsing, regex, APIs and security scripting |
| **Total** | **638** | after removing 96 duplicates |

### Distribution

| By round | Count | | By level | Count |
|---|---|---|---|---|
| Technical | 466 | | L1 (Junior) | 192 |
| HR Screening | 66 | | L2 (Intermediate) | 223 |
| SOC Investigation | 54 | | L3 (Senior) | 118 |
| Hiring Manager | 52 | | Any level | 105 |

The questions span 33 categories.

## Question structure

```json
{
  "id": "b-001",
  "text": "Tell me about yourself.",
  "soc_level": "All",
  "round": "hr",
  "difficulty": "beginner",
  "category": "Behavioral",
  "expected_concepts": [
    "Use present-past-future: current role, relevant background, why this job",
    "Keep it to 60-90 seconds",
    "Tie every point to security operations",
    "End with why you are excited about this role"
  ],
  "follow_ups": ["What was the result?", "What would you do differently next time?"],
  "rubric": "Strong (85+): covers most expected points ... Weak (<60): vague, incorrect or off-question."
}
```

- **`expected_concepts`** is what the grader scores against. The interviewer never reveals it.
- **`follow_ups`** are probes the interviewer can use when an answer is vague or interesting.
- **`soc_level`** and **`round`** decide which questions are eligible for a given interview. A technical focus (for example Splunk) narrows the technical and investigation rounds to that tool's questions.

## Removing duplicates

Merging four sources produced overlapping questions, some worded identically and some near-identically. The cleanup process:

1. Compared the questions across all four sources and flagged repeated ones, both exact and near-identical wording.
2. Kept one copy of each repeated question in the bank.
3. Mapped each source document's numbering one-to-one onto the bank's IDs (`soc→sa`, `tool→tl`, `py→py`, `b→b`), then checked every mapping against the question text. That way, two different questions that happened to share wording were never merged by mistake.
4. Recorded the 96 removed IDs in [`backend/data/removed_duplicates.json`](../backend/data/removed_duplicates.json).
5. Applied the removal in two places: at seed time (`lib/seed_data.py`, `lib/seed.py`), and as a one-time migration that cleans existing local databases on upgrade.

## Browsing the bank

Each question's level, round, category, scoring points and follow-ups can be reviewed in the question data files under `backend/data/`.
