#!/usr/bin/env python3
"""Validate a skills-plainer analysis JSON (schema skills-plainer/analysis@1).

Checks shape, enums, rubric coverage, and that every piece of evidence
points at a real file and an existing line in the embedded inventory.

Usage: validate.py <analysis.json> [...]
Exit 0 when no errors (warnings allowed), 1 otherwise.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RUBRIC = ["trigger-precision", "progressive-disclosure", "routing-clarity",
          "instruction-quality", "determinism", "safety", "user-control",
          "maintainability", "portability"]
ARCHETYPES = {"router", "workflow", "toolkit", "reference", "persona", "orchestrator", "generator"}
TOUCH = {"read", "write", "exec", "network", "spawn", "ask", "browser", "server"}
STEP = {"read", "exec", "decide", "ask", "write", "spawn", "verify"}
LEVEL = {"high", "medium", "low", "info"}
TIERS = ["always", "trigger", "demand", "execute"]
PHRASE_ROLES = {"what", "when", "verbs", "objects", "domain", "negative", "boundary"}


def check(path: Path) -> tuple[list[str], list[str]]:
    err, warn = [], []
    try:
        a = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return [f"not valid JSON: {e}"], []

    def need(obj, key, where, typ=None):
        if not isinstance(obj, dict) or key not in obj:
            err.append(f"{where}: missing '{key}'")
            return None
        v = obj[key]
        if typ and not isinstance(v, typ):
            err.append(f"{where}.{key}: expected {typ.__name__ if isinstance(typ, type) else typ}")
            return None
        return v

    if a.get("schema") != "skills-plainer/analysis@1":
        err.append("schema must be 'skills-plainer/analysis@1'")
    sid = need(a, "id", "root", str)
    if sid and sid != path.stem:
        warn.append(f"id '{sid}' differs from filename '{path.stem}'")
    need(a, "analyzedAt", "root", str)
    inv = need(a, "inventory", "root", dict) or {}
    files = {f["path"]: f for f in inv.get("files", [])}
    root = Path(inv["root"]) if inv.get("root") and Path(inv["root"]).is_dir() else None
    if not files:
        err.append("inventory.files is empty; embed scan.py output verbatim")

    def ev(e, where):
        if not isinstance(e, dict) or "file" not in e:
            err.append(f"{where}: evidence needs a 'file'")
            return
        f = files.get(e["file"])
        if f is None:
            err.append(f"{where}: '{e['file']}' is not in the inventory")
            return
        if e.get("kind") not in (None, "line", "strings", "inferred"):
            err.append(f"{where}: evidence kind must be line, strings or inferred")
        ln = e.get("line")
        if e.get("kind") in ("strings", "inferred"):
            return
        if ln is not None:
            if not isinstance(ln, int) or ln < 1:
                err.append(f"{where}: line must be a positive integer")
            elif f.get("lines") and ln > f["lines"]:
                err.append(f"{where}: {e['file']} has {f['lines']} lines, cited {ln}")
        end = e.get("end")
        if end is not None and isinstance(ln, int) and (not isinstance(end, int) or end < ln):
            err.append(f"{where}: end must be >= line")

    s = need(a, "summary", "root", dict) or {}
    h = need(s, "headline", "summary", str)
    if h and len(h) > 90:
        warn.append(f"summary.headline is {len(h)} chars (aim under 90)")
    if s.get("archetype") not in ARCHETYPES:
        err.append(f"summary.archetype must be one of {sorted(ARCHETYPES)}")
    if s.get("secondaryArchetype") not in (None, *ARCHETYPES):
        err.append(f"summary.secondaryArchetype must be one of {sorted(ARCHETYPES)}")
    for k in ("plain", "forAuthors"):
        if not isinstance(s.get(k), list) or not s.get(k):
            err.append(f"summary.{k}: needs at least one paragraph")
    for i, t in enumerate(s.get("touches", [])):
        if t.get("kind") not in TOUCH:
            err.append(f"summary.touches[{i}].kind '{t.get('kind')}' not in {sorted(TOUCH)}")

    t = need(a, "trigger", "root", dict) or {}
    desc = (inv.get("frontmatter") or {}).get("description") or ""
    pos = 0
    for i, p in enumerate(t.get("phrases", [])):
        txt = p.get("text", "")
        if txt not in desc:
            err.append(f"trigger.phrases[{i}] is not a verbatim substring of the description: '{txt[:60]}'")
        else:
            j = desc.find(txt, pos)
            if j < 0:
                warn.append(f"trigger.phrases[{i}] is out of order")
            else:
                pos = j + len(txt)
        if p.get("role") not in PHRASE_ROLES:
            err.append(f"trigger.phrases[{i}].role must be one of {sorted(PHRASE_ROLES)}")
    covered = sum(len(p.get("text", "")) for p in t.get("phrases", []) if p.get("text", "") in desc)
    if desc and covered / len(desc) < 0.6:
        warn.append(f"trigger.phrases cover {round(100 * covered / len(desc))}% of the description; aim to cover it in order")
    if len(t.get("fires", [])) < 3:
        warn.append("trigger.fires: give 5-8 examples")
    if len(t.get("nearMiss", [])) < 2:
        warn.append("trigger.nearMiss: give 3-6 near misses")

    tiers = need(a, "loadTiers", "root", list) or []
    if [x.get("tier") for x in tiers] != TIERS:
        err.append(f"loadTiers must be exactly {TIERS} in order")
    for i, x in enumerate(tiers):
        for f in x.get("files", []):
            if f.split("#")[0] not in files:
                err.append(f"loadTiers[{i}].files: '{f}' not in inventory")

    routes = need(a, "routes", "root", list) or []
    if not 2 <= len(routes) <= 6:
        warn.append("routes: give 2-6")
    for i, r in enumerate(routes):
        st = r.get("stops", [])
        if not st or st[0] != "SKILL.md":
            err.append(f"routes[{i}] must start at SKILL.md")
        for sp in st:
            if sp not in files:
                err.append(f"routes[{i}].stops: '{sp}' not in inventory")
        if not r.get("id") or not r.get("label"):
            err.append(f"routes[{i}] needs id and label")

    inv_cmds = len(inv.get("commands", []))
    if inv_cmds and len(a.get("commands", [])) != inv_cmds:
        warn.append(f"commands: analysis lists {len(a.get('commands', []))}, scanner found {inv_cmds}")
    for i, c in enumerate(a.get("commands", [])):
        for f in c.get("loads", []):
            if f not in files:
                err.append(f"commands[{i}].loads: '{f}' not in inventory")

    steps = need(a, "lifecycle", "root", list) or []
    if not 4 <= len(steps) <= 12:
        warn.append("lifecycle: give 4-12 steps")
    for i, stp in enumerate(steps):
        if stp.get("kind") not in STEP:
            err.append(f"lifecycle[{i}].kind must be one of {sorted(STEP)}")
        for j, e in enumerate(stp.get("evidence", [])):
            ev(e, f"lifecycle[{i}].evidence[{j}]")
        for f in stp.get("files", []):
            if f not in files:
                err.append(f"lifecycle[{i}].files: '{f}' not in inventory")

    for i, c in enumerate(a.get("components", [])):
        if c.get("path") not in files:
            err.append(f"components[{i}].path '{c.get('path')}' not in inventory")
    for i, c in enumerate(a.get("scripts", [])):
        if c.get("path") not in files:
            err.append(f"scripts[{i}].path '{c.get('path')}' not in inventory")
    if "toolbox" in a and not isinstance(a["toolbox"], list):
        err.append("toolbox must be a list")
    for i, c in enumerate(a.get("toolbox") or []):
        if not c.get("name") or not c.get("need"):
            err.append(f"toolbox[{i}] needs name and need")
        for j, e in enumerate(c.get("evidence", [])):
            ev(e, f"toolbox[{i}].evidence[{j}]")
    for i, p in enumerate(a.get("patterns", [])):
        for j, e in enumerate(p.get("where", [])):
            ev(e, f"patterns[{i}].where[{j}]")
    for i, g in enumerate(a.get("guardrails", [])):
        if "evidence" in g:
            ev(g["evidence"], f"guardrails[{i}]")
        q = g.get("quote", "")
        e = g.get("evidence") or {}
        src = root / e.get("file", "") if root and e.get("file") else None
        if q and src and src.is_file() and isinstance(e.get("line"), int):
            norm = lambda t: re.sub(r"[\s*_`>]+", " ", t).strip().lower()
            lines = src.read_text(encoding="utf-8", errors="replace").split("\n")
            ln = e["line"]
            window = norm(" ".join(lines[max(0, ln - 4): (e.get("end") or ln) + 3]))
            if norm(q.strip("…. ")) not in window:
                err.append(f"guardrails[{i}].quote is not verbatim near {e['file']}:{ln}")
        if len(q) > 200:
            warn.append(f"guardrails[{i}].quote is long; keep quotes short")
    for i, r in enumerate(a.get("risks", [])):
        if r.get("level") not in LEVEL:
            err.append(f"risks[{i}].level must be one of {sorted(LEVEL)}")
        if "evidence" in r:
            ev(r["evidence"], f"risks[{i}]")

    sc = need(a, "scorecard", "root", list) or []
    ids = [x.get("id") for x in sc]
    for rid in RUBRIC:
        if rid not in ids:
            err.append(f"scorecard: missing criterion '{rid}'")
    for i, x in enumerate(sc):
        if x.get("id") not in RUBRIC:
            err.append(f"scorecard[{i}]: unknown id '{x.get('id')}'")
        if not isinstance(x.get("score"), int) or not 0 <= x["score"] <= 5:
            err.append(f"scorecard[{i}].score must be an integer 0-5")
        elif x["score"] < 4 and not x.get("fix"):
            warn.append(f"scorecard[{i}] ({x.get('id')}) scores {x['score']} but has no fix")
        if not x.get("evidence"):
            warn.append(f"scorecard[{i}] ({x.get('id')}) has no evidence")
        for j, e in enumerate(x.get("evidence", [])):
            ev(e, f"scorecard[{i}].evidence[{j}]")
    return err, warn


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    bad = 0
    for p in argv:
        err, warn = check(Path(p))
        for e in err:
            print(f"ERROR {p}: {e}")
        for w in warn:
            print(f"warn  {p}: {w}")
        print(f"{'ok' if not err else 'FAIL'} {p}: {len(err)} errors, {len(warn)} warnings")
        bad += bool(err)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
