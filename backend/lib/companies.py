"""Fictional company generation from DB company templates (procedural, so it never repeats verbatim)."""
import random

from lib.db import db

ENV_LABELS = {
    "random": "Random Company", "financial": "Financial Institution", "healthcare": "Healthcare",
    "technology": "Technology Company", "government": "Government Contractor", "enterprise": "Enterprise",
    "mssp": "MSSP", "startup": "Startup",
}


async def generate_company(environment: str, position: str) -> dict:
    templates = await db.company_templates.find({}, {"_id": 0}).to_list(100)
    pool = [t for t in templates if t["environment"] == environment] or templates
    t = random.choice(pool)
    a, b = t["name_parts"]
    lo, hi = t["employees"]
    stack = random.sample(t["stack_pool"], k=min(6, len(t["stack_pool"])))
    focus = random.sample(t["focus"], k=min(4, len(t["focus"])))
    soc = random.choice([
        "24/7 internal SOC with three shifts",
        "Hybrid SOC: in-house analysts with an MDR partner overnight",
        "Follow-the-sun SOC across two regions",
        "Lean SOC team of 9 analysts with on-call rotation",
    ]) if t["environment"] != "mssp" else "24/7 multi-tenant SOC serving 140+ customers"
    return {
        "name": f"{random.choice(a)} {random.choice(b)}",
        "industry": t["industry"],
        "environment": t["environment"],
        "employees": random.randrange(lo, hi, 50),
        "stack": stack,
        "focus": focus,
        "soc_description": soc,
        "position_title": position,
    }
