#!/usr/bin/env python3
"""Find installed Agent Skills by name or path.

Usage:
  locate.py <name-or-path>      matches as JSON (path, name, origin)
  locate.py --all               every installed skill with its description
  locate.py --all --status      ... plus whether a current analysis exists

Search order: a literal path, ./.claude/skills, ~/.claude/skills,
~/.agents/skills, then plugin marketplaces and plugin caches under
~/.claude/plugins. Reads SKILL.md frontmatter only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

HOME = Path.home()
STORE = HOME / ".skills-plainer" / "analyses"


def roots() -> list[tuple[str, Path]]:
    out = [("project", Path.cwd() / ".claude" / "skills"),
           ("user", HOME / ".claude" / "skills"),
           ("agents", HOME / ".agents" / "skills")]
    plug = HOME / ".claude" / "plugins"
    for sub in ("marketplaces", "cache"):
        base = plug / sub
        if base.is_dir():
            for mk in sorted(base.iterdir()):
                if mk.is_dir():
                    out.append((f"plugin:{mk.name}", mk))
    return out


def front(skill_md: Path) -> dict:
    try:
        t = skill_md.read_text(encoding="utf-8", errors="replace")[:6000]
    except OSError:
        return {}
    m = re.match(r"^---\s*\n(.*?)\n---", t, re.S)
    if not m:
        return {}
    d = {}
    for k in ("name", "description", "version"):
        km = re.search(rf"^{k}\s*:\s*(.+)$", m.group(1), re.M)
        if km:
            d[k] = km.group(1).strip().strip("\"'")
    return d


def walk(origin: str, base: Path, max_depth: int):
    if not base.is_dir():
        return
    base_depth = len(base.parts)
    for dp, dns, fns in os.walk(base, followlinks=True):
        depth = len(Path(dp).parts) - base_depth
        dns[:] = [d for d in dns if d not in (".git", "node_modules", "__pycache__")]
        if depth >= max_depth:
            dns[:] = []
        if "SKILL.md" in fns:
            p = Path(dp)
            fm = front(p / "SKILL.md")
            yield {"path": str(p), "folder": p.name, "name": fm.get("name", p.name),
                   "description": fm.get("description", ""), "version": fm.get("version"),
                   "origin": origin}
            dns[:] = []


def all_skills() -> list[dict]:
    seen, out = set(), []
    for origin, base in roots():
        depth = 2 if not origin.startswith("plugin:") else 7
        for s in walk(origin, base, depth):
            real = os.path.realpath(s["path"])
            if real in seen:
                continue
            seen.add(real)
            out.append(s)
    return out


def analysis_status(s: dict) -> str:
    for cand in (STORE / f"{s['name']}.json",):
        if cand.exists():
            try:
                a = json.loads(cand.read_text())
                files = {f["path"]: f.get("sha1") for f in a.get("inventory", {}).get("files", [])}
                sm = Path(s["path"]) / "SKILL.md"
                cur = hashlib.sha1(sm.read_text(encoding="utf-8", errors="ignore").encode("utf-8", "ignore")).hexdigest()[:10]
                return "current" if files.get("SKILL.md") == cur else "stale"
            except Exception:
                return "unreadable"
    return "none"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args(argv)
    if a.all or not a.target:
        skills = all_skills()
        if a.status:
            for s in skills:
                s["analysis"] = analysis_status(s)
        for s in skills:
            s["description"] = s["description"][:200]
        print(json.dumps(skills, indent=2, ensure_ascii=False))
        return 0
    t = os.path.expanduser(a.target)
    p = Path(t)
    if p.is_file() and p.name == "SKILL.md":
        p = p.parent
    if (p / "SKILL.md").exists():
        fm = front(p / "SKILL.md")
        print(json.dumps([{"path": str(p.resolve()), "name": fm.get("name", p.name), "origin": "path"}], indent=2))
        return 0
    key = a.target.strip("/").lower()
    hits = [s for s in all_skills() if s["name"].lower() == key or s["folder"].lower() == key]
    if not hits:
        hits = [s for s in all_skills() if key in s["name"].lower()]
    print(json.dumps([{k: s[k] for k in ("path", "name", "origin", "version")} for s in hits], indent=2))
    return 0 if hits else 1


if __name__ == "__main__":
    sys.exit(main())
