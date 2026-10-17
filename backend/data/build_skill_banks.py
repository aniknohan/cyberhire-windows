"""One-off generator for the tool/skill focus banks from the user's PDFs:
tools200_raw.json (50 Splunk, 50 Wireshark, 50 Nmap, 50 Active Directory) and python100_raw.json (Python for Cybersecurity)
-> question_bank_skills.json. Questions get track "skills" + a `topic`; they're used when a candidate picks a Technical focus.

Run: cd /app/backend && python data/build_skill_banks.py
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


async def enrich(batch: list[dict]) -> dict[int, dict]:
    listing = "\n".join(f"{i}. ({q['topic']}) {q['text']}" for i, q in enumerate(batch))
    res = await llm_json(
        "You are a senior security engineer who interviews SOC analysts and penetration testers. Return strict JSON only.",
        "For each interview question below give:\n"
        "level: L1 (junior fundamentals), L2 (intermediate hands-on), or L3 (senior / complex design or investigation);\n"
        "round: technical (concept/tool/how-to) or scenario (a concrete situation the candidate must work through step by step);\n"
        "concepts: 4-6 short expected answer points (specific commands, queries, filters, fields, techniques where relevant);\n"
        "follow_ups: 2 natural spoken follow-up questions.\n"
        'Return {"items": [{"i": <index>, "level": "...", "round": "...", "concepts": [...], "follow_ups": [...]}]} covering every index.\n\n' + listing,
    )
    return {int(x["i"]): x for x in res.get("items", [])}


async def main() -> None:
    tools = json.loads((HERE / "tools200_raw.json").read_text())
    py = json.loads((HERE / "python100_raw.json").read_text())
    qs = [dict(q, topic=q["section"], pid=f"tl-{q['n']:03d}") for q in tools] + \
         [dict(q, topic="Python", pid=f"py-{q['n']:03d}") for q in py]
    assert len(qs) == 300, len(qs)
    extra: dict[int, dict] = {}
    for s in range(0, len(qs), 25):
        got = await enrich(qs[s:s + 25])
        extra.update({s + i: v for i, v in got.items()})
        print("enriched", len(extra))
    out = []
    for i, q in enumerate(qs):
        x = extra.get(i, {})
        lv = x.get("level") if x.get("level") in DIFF else "L2"
        rnd = "scenario" if x.get("round") == "scenario" or q["text"].lower().startswith("final scenario") else "technical"
        concepts = x.get("concepts") or ["correct tool usage", "accurate terminology", "validation of results", "safe, in-scope approach"]
        out.append({
            "id": q["pid"], "text": q["text"], "primary_role": "All", "track": "skills", "topic": q["topic"],
            "soc_level": lv, "round": rnd, "difficulty": DIFF[lv], "category": q["topic"], "subcategory": q["section"],
            "expected_concepts": concepts,
            "rubric": f"Strong (85+): covers most of [{', '.join(concepts[:5])}] with accurate, practical tool knowledge. "
                      "Adequate (60-84): correct core idea, misses some depth or specifics. Weak (<60): vague, incorrect, or does not answer the question.",
            "follow_ups": x.get("follow_ups") or ["How would you verify that?", "What would you do next?"],
            "scenario_capable": rnd == "scenario", "communication_skills": COMM[rnd], "technical_depth": DEPTH[lv],
            "est_answer_seconds": 120,
        })
    (HERE / "question_bank_skills.json").write_text(json.dumps(out, indent=1))
    print("wrote", len(out))


if __name__ == "__main__":
    asyncio.run(main())
