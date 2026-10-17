"""One-off generator: soc200_raw.json (user's "200 Real SOC Analyst Job Interview Questions" PDF) -> question_bank_soc200.json.

Run: cd /app/backend && python data/build_soc200_bank.py
Level by number (1-70 L1, 71-140 L2, 141-200 L3); Claude assigns the interview round, category, expected concepts and follow-ups.
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")
from data.build_pentest_bank import COMM, DEPTH, DIFF  # noqa: E402
from lib.llm import llm_json  # noqa: E402

HERE = Path(__file__).parent


def level(n: int) -> str:
    return "L1" if n <= 70 else "L2" if n <= 140 else "L3"


async def enrich(batch: list[tuple[int, str]]) -> dict[int, dict]:
    listing = "\n".join(f"{n}. [{level(n)}] {t}" for n, t in batch)
    res = await llm_json(
        "You are a senior SOC manager who interviews SOC analyst candidates. Return strict JSON only.",
        "Classify and enrich each SOC analyst interview question below.\n"
        "round: one of hr (background, motivation, behavioral, career), technical (concepts, tools, protocols, how-would-you-detect), "
        "scenario (a concrete alert/incident situation the candidate must investigate step by step), "
        "manager (judgment, prioritization, escalation, communication with leadership, process/team improvement).\n"
        "category: 1-3 word topic (e.g. Alert Triage, SIEM, Phishing, Identity, EDR, Networking, Active Directory, Threat Hunting, "
        "Detection Engineering, Incident Response, Cloud Security, Behavioral, Leadership).\n"
        "concepts: 4-6 short expected answer points a strong candidate covers. follow_ups: 2 natural spoken follow-up questions.\n"
        'Return {"items": [{"n": <number>, "round": "...", "category": "...", "concepts": [...], "follow_ups": [...]}]} covering every number.\n\n' + listing,
    )
    return {int(x["n"]): x for x in res.get("items", [])}


async def main() -> None:
    raw = {int(k): v for k, v in json.loads((HERE / "soc200_raw.json").read_text()).items()}
    assert len(raw) == 200
    items = sorted(raw.items())
    extra: dict[int, dict] = {}
    for s in range(0, 200, 25):
        extra.update(await enrich(items[s:s + 25]))
        print("enriched", len(extra))
    out = []
    for n, text in items:
        x, lv = extra.get(n, {}), level(n)
        rnd = x.get("round") if x.get("round") in COMM else "technical"
        concepts = x.get("concepts") or ["structured triage", "evidence gathering", "accurate terminology", "escalation decision"]
        out.append({
            "id": f"sa-{n:03d}", "text": text, "primary_role": "SOC Analyst", "track": "soc",
            "soc_level": "All" if rnd == "hr" and lv == "L1" else lv, "round": rnd, "difficulty": DIFF[lv],
            "category": x.get("category") or "General", "subcategory": x.get("category") or "General", "expected_concepts": concepts,
            "rubric": f"Strong (85+): covers most of [{', '.join(concepts[:5])}] in a logical order with accurate terminology and a clear conclusion. "
                      "Adequate (60-84): correct core idea, misses some depth or structure. Weak (<60): vague, incorrect, or does not answer the question.",
            "follow_ups": x.get("follow_ups") or ["Walk me through how you'd verify that.", "What would make you escalate?"],
            "scenario_capable": rnd == "scenario", "communication_skills": COMM[rnd].copy() if rnd != "scenario" else
            ["Structured investigation narrative", "Reasoning out loud", "Technical vocabulary", "Decisiveness"],
            "technical_depth": DEPTH[lv], "est_answer_seconds": 90 if rnd in ("hr", "manager") else 120,
        })
    (HERE / "question_bank_soc200.json").write_text(json.dumps(out, indent=1))
    print("wrote", len(out))


if __name__ == "__main__":
    asyncio.run(main())
