"""Evaluate the analyst on realistic questions with code-graded checks.

Usage: python scripts/agent_eval.py [--only N]
Checks per case: expected tools were called, every number in the answer came from a tool,
"significant" is only claimed when a tool said so, and the turn finished without error.
Writes data/derived/checks/agent_eval.json.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import uuid

from ground_truth.agent import run_turn
from ground_truth.config import DERIVED

CASES = [
    {"q": "What changed around Lagos since 2018, and is it significant?", "tools": ["locate_place", "detect_change", "trend_at_point"]},
    {"q": "Is groundwater really declining in northern India?", "tools_any": ["trend_in_region", "trend_at_point"], "variable": "water"},
    {"q": "Where is rainfall trending in opposite directions?", "tools": ["find_divergence"], "variable": "rainfall"},
    {"q": "How unusual has the last month been in Nairobi?", "tools": ["locate_place", "now_vs_normal"]},
    {"q": "Is the Arctic warming faster than the rest of the world?", "tools_any": ["trend_in_region"], "variable": "temperature"},
    {"q": "Show me the vegetation map for 2010.", "tools": ["set_view"]},
    {"q": "Are there active fires in California right now?", "tools": ["live_events"]},
    {"q": "Is Greenland losing ice?", "tools": ["trend_in_region"], "variable": "water", "says": "decrease|losing|loss|declin"},
    {"q": "What changed in Dubai between 2017 and 2025?", "tools": ["locate_place", "detect_change"], "years": [2017, 2025]},
    {"q": "What is the vegetation trend in the middle of the Pacific Ocean, at 0 N 150 W?", "tools": ["trend_at_point"]},
    {"q": "Is Cairo getting wetter or drier?", "tools_any": ["trend_at_point", "trend_in_region"], "variable": "rainfall"},
    {"q": "Has the land around Phoenix changed since 2018?", "tools": ["locate_place", "detect_change"]},
    {"q": "Is the Sahel getting more rain than before?", "tools": ["trend_in_region"], "variable": "rainfall"},
    {"q": "Is China greening?", "tools": ["trend_in_region"], "variable": "vegetation", "says": "green|increase"},
    {"q": "Tell me the temperature range in Maiduguri, Nigeria over the last two years.", "tools": ["recent_history"],
     "says": "45\\.6|10\\.7"},
    {"q": "Was this year hotter than normal in Lagos?", "tools_any": ["recent_history", "now_vs_normal"],
     "never": "API key|another dataset|different dataset|other tool"},
]

SIGNIFICANT_CLAIM = re.compile(r"(?<!not )(?<!isn't )statistically significant", re.IGNORECASE)


def run_case(case: dict) -> dict:
    t0 = time.perf_counter()
    answer, tools, errors, done = "", [], [], None
    for ev in run_turn(f"eval-{uuid.uuid4().hex[:12]}", case["q"], include_results=True):
        if ev["type"] == "text":
            answer += ev["delta"]
        elif ev["type"] == "tool":
            tools.append(ev)
        elif ev["type"] == "error":
            errors.append(ev["message"])
        elif ev["type"] == "done":
            done = ev
    names = [t["name"] for t in tools]
    checks = {}
    if "tools" in case:
        checks["expected_tools"] = all(n in names for n in case["tools"])
    if "tools_any" in case:
        checks["expected_tools"] = any(n in names for n in case["tools_any"])
    if "variable" in case:
        checks["right_variable"] = any(t.get("args", {}).get("variable") == case["variable"] for t in tools)
    if "years" in case:
        checks["right_years"] = any(t["name"] == "detect_change" and [t["args"].get("year_a"), t["args"].get("year_b")] == case["years"]
                                    for t in tools)
    if "never" in case:
        checks["no_referral"] = not re.search(case["never"], answer, re.IGNORECASE)
    if "says" in case:
        checks["right_conclusion"] = bool(re.search(case["says"], answer, re.IGNORECASE))
    checks["numbers_from_tools"] = bool(done) and not done["unverified_numbers"]
    any_significant = any(isinstance(t.get("result"), dict) and t["result"].get("significant") is True for t in tools)
    checks["significance_honest"] = any_significant or not SIGNIFICANT_CLAIM.search(answer)
    checks["no_error"] = not errors and done is not None
    return {"question": case["q"], "passed": all(checks.values()), "checks": checks, "tools": names,
            "unverified": done["unverified_numbers"] if done else None, "usage": done["usage"] if done else None,
            "seconds": round(time.perf_counter() - t0, 1), "answer": answer, "errors": errors}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", type=int, default=None)
    args = ap.parse_args()
    cases = CASES[: args.only] if args.only else CASES
    results = []
    for c in cases:
        r = run_case(c)
        results.append(r)
        failed = [k for k, v in r["checks"].items() if not v]
        print(f"{'PASS' if r['passed'] else 'FAIL'} {r['seconds']:5.1f}s  {c['q'][:60]:60s} "
              f"{'' if r['passed'] else 'failed: ' + ', '.join(failed)}", flush=True)
    passed = sum(r["passed"] for r in results)
    tokens_in = sum((r["usage"] or {}).get("input_tokens", 0) for r in results)
    tokens_out = sum((r["usage"] or {}).get("output_tokens", 0) for r in results)
    summary = {"passed": passed, "total": len(results), "rate": passed / len(results),
               "median_seconds": sorted(r["seconds"] for r in results)[len(results) // 2],
               "tokens": {"input": tokens_in, "output": tokens_out}, "results": results,
               "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    out = DERIVED / "checks" / "agent_eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=1))
    print(f"\n{passed}/{len(results)} passed; median {summary['median_seconds']}s; "
          f"tokens in {tokens_in}, out {tokens_out}; wrote {out}")


if __name__ == "__main__":
    main()
