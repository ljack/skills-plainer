#!/usr/bin/env python3
"""Deterministic inventory of an Agent Skill folder.

Reads a skill directory (the folder holding SKILL.md) and writes a JSON
inventory: frontmatter, file tree with roles and token estimates, the
heading outline, cross-file references, detected sub-commands, script
capabilities, tool mentions and risk signals.

It only reads files. It never executes, imports or sources anything from
the skill under review.

Usage:
  scan.py <skill-dir> [--out inventory.json] [--pretty]
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path

SCHEMA = "skills-plainer/inventory@1"
MAX_TEXT_BYTES = 400_000          # larger text files are counted, not parsed
TOKEN_RATIO = 4.0                 # ~chars per token for English prose/code

TEXT_EXT = {
    ".md", ".markdown", ".txt", ".py", ".js", ".mjs", ".cjs", ".ts", ".tsx",
    ".jsx", ".sh", ".bash", ".zsh", ".json", ".yaml", ".yml", ".toml", ".html",
    ".htm", ".css", ".xml", ".csv", ".cmd", ".ps1", ".rb", ".go", ".rs", ".sql",
    ".ini", ".cfg", "",
}
SCRIPT_EXT = {".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".bash", ".zsh",
              ".cmd", ".ps1", ".rb", ".go", ".rs"}
LANG = {".py": "python", ".js": "javascript", ".mjs": "javascript",
        ".cjs": "javascript", ".ts": "typescript", ".sh": "shell",
        ".bash": "shell", ".zsh": "shell", ".cmd": "batch", ".ps1": "powershell",
        ".rb": "ruby", ".go": "go", ".rs": "rust"}

KNOWN_FM = {
    "name", "description", "license", "version", "allowed-tools",
    "argument-hint", "user-invocable", "disable-model-invocation", "model",
    "metadata", "compatibility", "when_to_use", "context", "agent", "hooks",
    "effort", "paths", "shell",
}

TOOL_NAMES = [
    "Bash", "Read", "Write", "Edit", "Glob", "Grep", "Agent", "Task",
    "AskUserQuestion", "WebFetch", "WebSearch", "Skill", "TodoWrite",
    "NotebookEdit", "ToolSearch", "Monitor", "Artifact",
]

IMPERATIVES = ["MUST", "NEVER", "ALWAYS", "IMPORTANT", "DO NOT", "CRITICAL",
               "REQUIRED", "SHOULD NOT"]

CAPABILITY_PATTERNS = {
    "network": [r"\brequests\.", r"\burllib\b", r"\bhttp\.client\b", r"\bfetch\(",
                r"\baxios\b", r"\bcurl\b", r"\bwget\b", r"\bsocket\b",
                r"https?://(?!localhost|127\.0\.0\.1)[\w.-]+\.\w+"],
    "subprocess": [r"\bsubprocess\b", r"\bos\.system\b", r"\bchild_process\b",
                   r"\bexecSync\b", r"\bspawn\(", r"\beval\s+\""],
    "filesystem-write": [r"open\([^)]*['\"][wa]b?['\"]", r"\.write_text\(",
                         r"\.write_bytes\(", r"\bwriteFileSync\b", r"\bwriteFile\(",
                         r"\bshutil\.(copy|move|rmtree)", r"\bmkdir\b", r"\bos\.makedirs\b"],
    "filesystem-delete": [r"\brm\s+-[rf]+", r"\bos\.remove\b", r"\bunlink\(",
                          r"\brmtree\b", r"\bunlinkSync\b"],
    "env-secrets": [r"os\.environ", r"process\.env", r"\$\{?[A-Z_]*(KEY|TOKEN|SECRET)[A-Z_]*"],
    "llm-api": [r"\banthropic\b", r"\bopenai\b", r"claude\s+-p\b", r"api\.anthropic\.com"],
    "browser": [r"\bplaywright\b", r"\bpuppeteer\b", r"\bselenium\b", r"webbrowser\.open"],
    "server": [r"http\.server", r"createServer\(", r"\.listen\(", r"socketserver"],
}

MACHINE_PATH = re.compile(r"(?<![\w/.])(?:/Users|/home)/([A-Za-z0-9._-]+)(?:/[\w.@+-]+)*")
PLACEHOLDER_USERS = {"you", "your", "yourname", "user", "username", "me", "name", "example", "foo", "bar", "alice", "bob", "ubuntu", "runner", "shared", "linuxbrew"}
VAR_DEFAULT = re.compile(r'\b([A-Z_][A-Z0-9_]*)="?\$\{\1:-(.+?)\}"?\s*$', re.M)
CD_PWD = re.compile(r'^\$\(cd(?:\s+-[LP])?\s+"?([^")]+?)"?\s*&&\s*pwd(?:\s+-[LP])?\)$')
VAR_ASSIGN = re.compile(r'^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)="?((?:/|~/)[^"\s]+)"?\s*$', re.M)
VAR_CALL = re.compile(r'\$\{?([A-Z_][A-Z0-9_]*)\}?/([\w./-]+)')
DIRECT_CALL = re.compile(r'(?:^|[|;&]\s*)"?((?:/(?!dev/|tmp/|usr/|bin/|etc/|var/|opt/)|~/)[\w./@+-]+)"?')
SCRIPT_SUFFIXES = {".py", ".sh", ".js", ".mjs", ".ts", ".rb", ".pl"}


def resolve_default(value: str) -> str | None:
    """A shell default as a path, without running it. `$(cd X && pwd)` becomes X
    with symlinks resolved, as the shell would. Anything else computed is None."""
    m = CD_PWD.match(value.strip())
    raw = m.group(1) if m else value.strip()
    raw = raw.replace("${HOME}", "$HOME").replace("$HOME", str(Path.home()))
    if "$" in raw or "`" in raw:
        return None
    raw = os.path.expanduser(raw)
    return os.path.realpath(raw) if m else raw


def hardcoded_paths(texts: dict[str, str]) -> list[dict]:
    """Machine-specific absolute paths in the skill's text, grouped by path."""
    found: dict[str, list[dict]] = {}
    for rel, text in texts.items():
        for n, line in enumerate(text.splitlines(), 1):
            for m in MACHINE_PATH.finditer(line):
                if m.group(1).lower() in PLACEHOLDER_USERS:
                    continue
                found.setdefault(m.group(0).rstrip(".,"), []).append({"file": rel, "line": n})
    return [{"path": p, "count": len(locs), "locations": locs[:20]}
            for p, locs in sorted(found.items(), key=lambda kv: (-len(kv[1]), kv[0]))]


def _is_program(p: Path) -> bool:
    return p.is_file() and (os.access(p, os.X_OK) or p.suffix in SCRIPT_SUFFIXES)


def external_tools(root: Path, docs: dict[str, str]) -> list[dict]:
    """Programs the instructions call that live outside the skill folder.
    Found from the text and checked with stat only; nothing is executed."""
    variables: dict[str, str] = {}
    for text in docs.values():
        variables.update({m[1]: m[2] for m in VAR_ASSIGN.finditer(text)})
    for text in docs.values():
        variables.update({m[1]: r for m in VAR_DEFAULT.finditer(text) if (r := resolve_default(m[2]))})

    tools: dict[str, dict] = {}

    def add(full: Path, via: str, rel: str, n: int, need_exists: bool):
        if full == root or root in full.parents:
            return
        exists = _is_program(full)
        if need_exists and not exists:
            return
        if not exists and full.parent.name != "bin":  # a folder or data file, not a program
            return
        t = tools.setdefault(str(full), {"name": full.name, "path": str(full), "via": via, "exists": exists, "mentions": []})
        t["mentions"].append({"file": rel, "line": n})

    for rel, text in docs.items():
        fenced = False
        for n, line in enumerate(text.splitlines(), 1):
            if line.lstrip().startswith("```"):
                fenced = not fenced
                continue
            for m in VAR_CALL.finditer(line):
                if m.group(1) in variables:
                    add(Path(variables[m.group(1)]).expanduser() / m.group(2), "$" + m.group(1), rel, n, False)
            if fenced:
                m = DIRECT_CALL.search(line.strip())
                if m:
                    add(Path(m.group(1)).expanduser(), "path", rel, n, True)

    # Siblings of a program already found, when the text names them in code.
    for folder in sorted({Path(t["path"]).parent for t in tools.values() if t["exists"]}):
        for p in sorted(folder.iterdir())[:200]:
            if str(p) in tools or p.name.startswith(".") or not _is_program(p):
                continue
            pat = re.compile(r"`" + re.escape(p.name) + r"\b")
            hits = [{"file": rel, "line": n} for rel, text in docs.items()
                    for n, line in enumerate(text.splitlines(), 1) if pat.search(line)]
            if hits:
                tools[str(p)] = {"name": p.name, "path": str(p), "via": "named", "exists": True, "mentions": hits}

    out = []
    for t in sorted(tools.values(), key=lambda x: x["name"]):
        t["bytes"] = Path(t["path"]).stat().st_size if t["exists"] else None
        t["mentionCount"] = len(t["mentions"])
        t["mentions"] = t["mentions"][:8]
        out.append(t)
    return out[:60]


INTERPRETERS = r"(?:python3?|node|deno|bun|ruby|perl|php|sh|bash|zsh|npx|uv|uvx|pipx|go|cargo|make)"


def broad_preapprovals(raw) -> list[str]:
    """allowed-tools entries that pre-approve arbitrary code: bare Bash, Bash(*),
    or an interpreter followed straight by a wildcard (Bash(python3 *))."""
    if isinstance(raw, str):
        items = re.findall(r"[A-Za-z]+\([^)]*\)|[A-Za-z]+", raw)
    elif isinstance(raw, list):
        items = [str(x) for x in raw]
    else:
        return []
    out = []
    for it in items:
        it = it.strip()
        m = re.fullmatch(r"Bash(?:\((.*)\))?", it)
        if not m:
            continue
        arg = (m.group(1) or "").strip()
        if arg in ("", "*", ":*") or re.fullmatch(INTERPRETERS + r"(?:\s+-\S+)*\s*(?::?\*)", arg):
            out.append(it)
    return out


RISK_PATTERNS = [
    ("high", "pipe-to-shell", r"(curl|wget)[^\n|]*\|\s*(ba|z)?sh"),
    ("high", "permission-bypass", r"dangerously-skip-permissions|--dangerously"),
    ("medium", "recursive-delete", r"\brm\s+-rf\b"),
    ("medium", "sudo", r"\bsudo\s"),
    ("medium", "eval", r"\beval\("),
    ("low", "secret-env", r"(API_KEY|_TOKEN|SECRET)"),
    ("low", "downloads-binary", r"(download|fetch)[^\n]{0,60}(binary|release|\.tar|\.zip)"),
]

LINK_MD = re.compile(r"\[([^\]]+)\]\(([^)\s#]+)(#[^)]*)?\)")
BACKTICK_PATH = re.compile(r"`([\w./-]+\.(?:md|py|js|mjs|sh|json|html|txt|cmd|ts|yaml|yml))`")
BARE_PATH = re.compile(r"(?<![\w.\[(])((?:references?|scripts|assets|agents|templates|examples|eval-viewer|bin|lib|docs)/[\w./-]+)")
HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE = re.compile(r"^\s*(```|~~~)")
CMD_ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|(.+)\|\s*$")


# --------------------------------------------------------------- helpers
def est_tokens(text: str) -> int:
    return int(round(len(text) / TOKEN_RATIO))


def read_text(p: Path) -> str | None:
    try:
        raw = p.read_bytes()
    except OSError:
        return None
    if b"\x00" in raw[:4096]:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return raw.decode("latin-1")
        except Exception:
            return None


def parse_frontmatter(text: str) -> tuple[dict, str, int, list[str]]:
    """Return (fields, body, body_start_line, warnings). Small YAML subset;
    uses PyYAML when it is installed."""
    warnings: list[str] = []
    if not text.startswith("---"):
        return {}, text, 1, ["SKILL.md has no YAML frontmatter"]
    m = re.match(r"^---\s*\n(.*?)\n---\s*(\n|$)", text, re.S)
    if not m:
        return {}, text, 1, ["frontmatter is not closed with ---"]
    block = m.group(1)
    body = text[m.end():]
    body_line = text[: m.end()].count("\n") + 1
    try:
        import yaml  # type: ignore
        data = yaml.safe_load(block) or {}
        if isinstance(data, dict):
            return {str(k): v for k, v in data.items()}, body, body_line, warnings
    except Exception:
        pass
    data: dict = {}
    lines = block.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        km = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if not km:
            i += 1
            continue
        key, val = km.group(1), km.group(2).strip()
        if val in (">", "|", ">-", "|-", ">+", "|+"):
            buf = []
            i += 1
            while i < len(lines) and (lines[i].startswith((" ", "\t")) or not lines[i].strip()):
                buf.append(lines[i].strip())
                i += 1
            data[key] = (" " if val.startswith(">") else "\n").join(b for b in buf).strip()
            continue
        if val == "":
            items, sub = [], {}
            i += 1
            while i < len(lines) and lines[i].startswith((" ", "\t", "-")):
                s = lines[i].strip()
                if s.startswith("- "):
                    items.append(_scalar(s[2:]))
                elif ":" in s:
                    a, b = s.split(":", 1)
                    sub[a.strip()] = _scalar(b.strip())
                i += 1
            data[key] = items if items else sub
            continue
        data[key] = _scalar(val)
        i += 1
    return data, body, body_line, warnings


def _scalar(v: str):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    if v.lower() in ("true", "yes"):
        return True
    if v.lower() in ("false", "no"):
        return False
    if v.startswith("[") and v.endswith("]"):
        return [_scalar(x) for x in v[1:-1].split(",") if x.strip()]
    return v


def classify(rel: str, ext: str, is_text: bool) -> str:
    parts = rel.lower().split("/")
    name = parts[-1]
    raw_name = rel.split("/")[-1]
    if rel == "SKILL.md":
        return "skill"
    if name.startswith("license"):
        return "license"
    if parts[0] in ("agents",) and ext == ".md":
        return "agent"
    if ext in (".md", ".markdown", ".txt") and parts[0] in ("reference", "references", "docs", "guides"):
        return "reference"
    if ext in (".md", ".markdown"):
        return "reference"
    if not is_text:
        return "binary"
    if ext in SCRIPT_EXT or (ext == "" and parts[0] in ("scripts", "bin") and not raw_name.isupper()):
        return "script"
    if ext in (".json", ".yaml", ".yml", ".toml", ".csv", ".txt") or raw_name.isupper():
        return "data"
    if ext in (".html", ".htm", ".css", ".svg"):
        return "asset"
    return "other"


def outline(body: str, start_line: int) -> list[dict]:
    out, in_fence = [], False
    for n, line in enumerate(body.split("\n"), start=start_line):
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        m = HEADING.match(line)
        if m and len(m.group(1)) <= 4:
            out.append({"level": len(m.group(1)), "text": m.group(2), "line": n})
    return out


def sections_with_tokens(body: str, start_line: int, heads: list[dict]) -> list[dict]:
    """Token weight of each top-level-ish section of SKILL.md."""
    lines = body.split("\n")
    secs = [h for h in heads if h["level"] <= 2]
    out = []
    for i, h in enumerate(secs):
        a = h["line"] - start_line
        b = (secs[i + 1]["line"] - start_line) if i + 1 < len(secs) else len(lines)
        chunk = "\n".join(lines[a:b])
        out.append({"heading": h["text"], "line": h["line"], "tokens": est_tokens(chunk),
                    "lines": b - a})
    return out


def find_refs(text: str, src_rel: str, all_files: set[str]) -> list[dict]:
    refs, seen = [], set()
    src_dir = os.path.dirname(src_rel)
    for n, line in enumerate(text.split("\n"), start=1):
        cands = []
        for m in LINK_MD.finditer(line):
            cands.append(("link", m.group(2)))
        for m in BACKTICK_PATH.finditer(line):
            cands.append(("mention", m.group(1)))
        for m in BARE_PATH.finditer(line):
            cands.append(("mention", m.group(1).rstrip(".,;:)")))
        for kind, target in cands:
            if re.match(r"^[a-z]+://", target):
                continue
            target = target.lstrip("./") if target.startswith("./") else target
            resolved = None
            for base in (src_dir, ""):
                cand = os.path.normpath(os.path.join(base, target)).replace("\\", "/")
                if cand in all_files:
                    resolved = cand
                    break
            if resolved is None:
                # tolerate prefixes like .claude/skills/<name>/scripts/x
                for f in all_files:
                    if target.endswith("/" + f) or f.endswith("/" + target):
                        resolved = f
                        break
            if resolved and resolved != src_rel:
                key = (resolved, n)
                if key in seen:
                    continue
                seen.add(key)
                refs.append({"from": src_rel, "to": resolved, "line": n, "kind": kind})
    return refs


def detect_commands(body: str, start_line: int, fm: dict) -> list[dict]:
    cmds = []
    for n, line in enumerate(body.split("\n"), start=start_line):
        m = CMD_ROW.match(line.strip())
        if not m:
            continue
        cells = [c.strip() for c in m.group(2).split("|")]
        sig = m.group(1).strip()
        name = sig.split()[0]
        if not re.match(r"^/?[a-z][\w:-]*$", name):
            continue
        refs = re.findall(r"\(([^)]+\.md)\)", line)
        cmds.append({"name": name.lstrip("/"), "signature": sig, "cells": cells,
                     "refs": refs, "line": n, "source": "table"})
    hint = fm.get("argument-hint")
    if not cmds and isinstance(hint, str):
        for tok in re.split(r"[\s|·,\[\]]+", hint):
            if re.match(r"^[a-z][\w-]{2,}$", tok):
                cmds.append({"name": tok, "signature": tok, "cells": [], "refs": [],
                             "line": None, "source": "argument-hint"})
    return cmds


def script_info(text: str, ext: str, rel: str) -> dict:
    first = text.split("\n", 1)[0]
    lang = LANG.get(ext)
    if first.startswith("#!"):
        if "python" in first:
            lang = "python"
        elif "node" in first:
            lang = "javascript"
        elif re.search(r"\b(ba|z)?sh\b", first):
            lang = "shell"
    caps = {}
    patterns = dict(CAPABILITY_PATTERNS)
    if lang == "shell":   # shell redirection writes files; in other languages '>' is a comparison
        patterns["filesystem-write"] = patterns["filesystem-write"] + [r"[^\s<>=-]\s*>{1,2}\s*[\w\"$~/.]"]
    for cap, pats in patterns.items():
        hits = []
        for pat in pats:
            for m in re.finditer(pat, text):
                line = text.count("\n", 0, m.start()) + 1
                hits.append(line)
                if len(hits) >= 5:
                    break
        if hits:
            caps[cap] = sorted(set(hits))[:5]
    args = sorted(set(re.findall(r"add_argument\(\s*['\"](-{1,2}[\w-]+|[\w-]+)['\"]", text)))
    if lang == "shell":
        args += sorted(set(re.findall(r"^\s*(--?[\w-]+)\)\s", text, re.M)))
    doc = None
    dm = re.search(r'^(?:#![^\n]*\n)?(?:\s*#[^\n]*\n)*?\s*(?:"""|\'\'\')(.+?)(?:"""|\'\'\')', text, re.S)
    if dm:
        doc = dm.group(1).strip().split("\n\n")[0][:400]
    elif lang in ("shell", "javascript"):
        cm = re.findall(r"^\s*(?:#|//)\s?(.+)$", text[:1500], re.M)
        cm = [c for c in cm if not c.startswith("!")]
        if cm:
            doc = " ".join(cm[:4])[:400]
    funcs = len(re.findall(r"^\s*(?:def|async def|function|func|fn)\s+\w+", text, re.M))
    imports = sorted(set(re.findall(r"^\s*(?:import|from)\s+([\w.]+)", text, re.M)))[:30] if lang == "python" else \
        sorted(set(re.findall(r"require\(['\"]([^'\"]+)['\"]\)|from\s+['\"]([^'\"]+)['\"]", text)))[:30]
    if imports and isinstance(imports[0], tuple):
        imports = sorted({a or b for a, b in imports})
    return {"language": lang, "shebang": first if first.startswith("#!") else None,
            "doc": doc, "args": args[:40], "functions": funcs, "imports": imports,
            "capabilities": caps, "entrypoint": bool(re.search(r"__main__|^main\(|process\.argv|\$1|\"\$@\"", text, re.M))}


def description_profile(desc: str) -> dict:
    d = desc or ""
    low = d.lower()
    quoted = re.findall(r"[\"“']([^\"”']{2,60})[\"”']", d)
    when = re.findall(r"(?:use (?:this skill )?(?:when|whenever|for|if)|triggers? (?:on|when)|invoke when)\b[^.]*", d, re.I)
    negatives = re.findall(r"(?:not for|do not use|don't use|never use|skip when|not (?:a|an) )[^.]*", d, re.I)
    words = re.findall(r"[A-Za-z][\w-]+", d)
    return {
        "chars": len(d), "words": len(words), "tokens": est_tokens(d),
        "hasWhen": bool(when), "whenClauses": [w.strip() for w in when][:6],
        "negativeClauses": [n.strip() for n in negatives][:6],
        "quotedTriggers": quoted[:20],
        "firstPerson": bool(re.search(r"\b(I|I'm|my)\b", d)),
        "secondPerson": bool(re.search(r"\byou\b", low)),
        "over1024": len(d) > 1024,
    }


# --------------------------------------------------------------- main scan
def scan(root: Path) -> dict:
    root = root.resolve()
    skill_md = root / "SKILL.md"
    if not skill_md.exists():
        alt = [p for p in root.iterdir() if p.name.lower() == "skill.md"] if root.is_dir() else []
        if not alt:
            raise SystemExit(f"error: no SKILL.md in {root}")
        skill_md = alt[0]

    files, all_rel = [], set()
    for dp, dns, fns in os.walk(root, followlinks=True):
        dns[:] = sorted(d for d in dns if d not in (".git", "node_modules", "__pycache__", ".venv", ".DS_Store"))
        for fn in sorted(fns):
            if fn == ".DS_Store":
                continue
            p = Path(dp) / fn
            rel = p.relative_to(root).as_posix()
            all_rel.add(rel)
            files.append((rel, p))

    entries, refs, scripts, tool_hits, risk_hits = [], [], [], {}, []
    external_loads: list[dict] = []
    imperative_counts = {k: 0 for k in IMPERATIVES}
    totals = {"bytes": 0, "tokens": 0, "lines": 0}

    for rel, p in files:
        try:
            size = p.stat().st_size
        except OSError:
            size = 0
        ext = p.suffix.lower()
        text = read_text(p) if (ext in TEXT_EXT and size <= MAX_TEXT_BYTES * 4) else None
        is_text = text is not None
        role = classify(rel, ext, is_text)
        e = {"path": rel, "role": role, "bytes": size, "ext": ext or None,
             "executable": os.access(p, os.X_OK) and not p.is_dir()}
        if is_text:
            e["lines"] = text.count("\n") + 1
            e["tokens"] = est_tokens(text)
            e["sha1"] = hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()[:10]
            totals["lines"] += e["lines"]
            totals["tokens"] += e["tokens"]
            parse = size <= MAX_TEXT_BYTES
            e["parsed"] = parse
            if parse and ext in (".md", ".markdown", ""):
                if ext:
                    hs = outline(text, 1)
                    e["headings"] = [h for h in hs if h["level"] <= 3][:60]
                    if hs:
                        e["title"] = hs[0]["text"]
            if parse and role in ("skill", "reference", "agent", "script", "asset", "data", "other"):
                refs.extend(find_refs(text, rel, all_rel))
            if parse and role in ("skill", "reference", "agent"):
                for t in TOOL_NAMES:
                    # count only unambiguous tool references: `Read`, "Read tool", Read(...)
                    c = len(re.findall(rf"`{t}`|\b{t} tool\b|\b{t}\((?=[^)]*\))", text))
                    if c:
                        tool_hits.setdefault(t, {"count": 0, "files": []})
                        tool_hits[t]["count"] += c
                        if rel not in tool_hits[t]["files"]:
                            tool_hits[t]["files"].append(rel)
                for mcp in set(re.findall(r"\bmcp__[\w-]+", text)):
                    tool_hits.setdefault(mcp, {"count": 0, "files": []})
                    tool_hits[mcp]["count"] += 1
                    tool_hits[mcp]["files"].append(rel)
                for k in IMPERATIVES:
                    imperative_counts[k] += len(re.findall(rf"\b{k}\b", text))
            if parse and role == "asset":
                hosts = sorted(set(re.findall(r"(?:src|href)\s*=\s*[\"'](https?://[^\"'/]+)", text))
                                | set(re.findall(r"@import\s+url\([\"']?(https?://[^\"'/)]+)", text)))
                if hosts:
                    external_loads.append({"path": rel, "hosts": hosts})
            if parse and role == "script":
                info = script_info(text, ext, rel)
                info["path"] = rel
                scripts.append(info)
            if parse:
                for level, rid, pat in RISK_PATTERNS:
                    for m in re.finditer(pat, text):
                        ln = text.count("\n", 0, m.start()) + 1
                        snippet = text.split("\n")[ln - 1].strip()[:160]
                        risk_hits.append({"level": level, "id": rid, "file": rel, "line": ln,
                                          "snippet": snippet})
                        break
        else:
            if role == "binary" and (rel.startswith(("scripts/", "bin/")) or "/bin/" in rel):
                scripts.append({"path": rel, "language": "binary", "doc": None, "args": [],
                                "functions": 0, "imports": [], "capabilities": {},
                                "entrypoint": e["executable"]})
        totals["bytes"] += size
        entries.append(e)

    text = read_text(skill_md) or ""
    fm, body, body_line, fm_warn = parse_frontmatter(text)
    heads = outline(body, body_line)
    desc = fm.get("description") or ""
    if not isinstance(desc, str):
        desc = str(desc)

    # inbound/outbound degree
    inbound, outbound = {}, {}
    for r in refs:
        outbound[r["from"]] = outbound.get(r["from"], 0) + 1
        inbound[r["to"]] = inbound.get(r["to"], 0) + 1
    reached_from_skill = set()
    frontier = ["SKILL.md"]
    edges = {}
    for r in refs:
        edges.setdefault(r["from"], set()).add(r["to"])
    depth = {"SKILL.md": 0}
    while frontier:
        nxt = []
        for f in frontier:
            for t in edges.get(f, ()):
                if t not in depth:
                    depth[t] = depth[f] + 1
                    nxt.append(t)
        frontier = nxt
    for e in entries:
        e["inbound"] = inbound.get(e["path"], 0)
        e["outbound"] = outbound.get(e["path"], 0)
        e["depth"] = depth.get(e["path"])
    orphans = [e["path"] for e in entries
               if e["role"] in ("reference", "agent") and e["path"] not in depth]

    role_tokens = {}
    for e in entries:
        role_tokens.setdefault(e["role"], {"files": 0, "tokens": 0, "bytes": 0})
        role_tokens[e["role"]]["files"] += 1
        role_tokens[e["role"]]["tokens"] += e.get("tokens", 0)
        role_tokens[e["role"]]["bytes"] += e["bytes"]

    unknown_fm = sorted(k for k in fm if k not in KNOWN_FM)
    warnings = list(fm_warn)
    name = fm.get("name")
    if not name:
        warnings.append("frontmatter has no name")
    elif isinstance(name, str) and name != root.name:
        warnings.append(f"frontmatter name '{name}' differs from folder '{root.name}'")
    if isinstance(name, str) and not re.match(r"^[a-z0-9][a-z0-9-]{0,63}$", name):
        warnings.append("name is not lowercase-hyphenated (<=64 chars)")
    if not desc:
        warnings.append("frontmatter has no description")
    elif len(desc) > 1024:
        warnings.append(f"description is {len(desc)} chars (limit 1024)")
    skill_lines = text.count("\n") + 1
    if skill_lines > 500:
        warnings.append(f"SKILL.md is {skill_lines} lines (guideline: under 500)")
    for o in orphans:
        warnings.append(f"{o} is never referenced from SKILL.md or its references")
    for rule in broad_preapprovals(fm.get("allowed-tools")):
        warnings.append(f"allowed-tools pre-approves '{rule}': any command of that shape runs without a prompt while the skill is active")

    texts = {}
    for e in entries:
        if e["role"] in ("skill", "reference", "agent", "script"):
            t = read_text(root / e["path"])
            if t is not None:
                texts[e["path"]] = t
    machine_paths = hardcoded_paths(texts)
    for mp in machine_paths[:5]:
        warnings.append(f"hard-coded machine path '{mp['path']}' appears {mp['count']} time(s)")
    outside = external_tools(root, {k: v for k, v in texts.items()
                                    if next(e["role"] for e in entries if e["path"] == k) != "script"})
    if outside:
        where = ", ".join(sorted({str(Path(t["path"]).parent) for t in outside})[:3])
        warnings.append(f"{len(outside)} tool(s) run from outside the skill folder ({where}); this scan does not cover their code")

    body_tokens = est_tokens(body)
    on_demand = sum(e.get("tokens", 0) for e in entries if e["role"] in ("reference", "agent"))
    executed = sum(e["bytes"] for e in entries if e["role"] in ("script", "binary"))

    return {
        "schema": SCHEMA,
        "scannedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(timespec="seconds"),
        "root": str(root),
        "folder": root.name,
        "frontmatter": fm,
        "frontmatterUnknownKeys": unknown_fm,
        "description": description_profile(desc),
        "skillMd": {
            "lines": skill_lines, "tokens": est_tokens(text), "bodyTokens": body_tokens,
            "bodyStartLine": body_line, "outline": heads,
            "sections": sections_with_tokens(body, body_line, heads),
        },
        "budget": {
            "always": est_tokens(f"{fm.get('name','')}: {desc}"),
            "onTrigger": body_tokens,
            "onDemand": on_demand,
            "executedBytes": executed,
            "externalTools": len(outside),
            "note": "tokens estimated at ~4 chars/token; 'always' is name+description in the skill index",
        },
        "totals": {**totals, "files": len(entries)},
        "roles": role_tokens,
        "files": entries,
        "references": refs,
        "orphans": orphans,
        "commands": detect_commands(body, body_line, fm),
        "scripts": scripts,
        "externalLoads": external_loads,
        "externalTools": outside,
        "hardcodedPaths": machine_paths,
        "tools": dict(sorted(tool_hits.items(), key=lambda kv: -kv[1]["count"])),
        "imperatives": {k: v for k, v in imperative_counts.items() if v},
        "risks": risk_hits[:60],
        "warnings": warnings,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("skill_dir")
    ap.add_argument("--out", help="write JSON here (default: stdout)")
    ap.add_argument("--pretty", action="store_true")
    a = ap.parse_args(argv)
    inv = scan(Path(os.path.expanduser(a.skill_dir)))
    js = json.dumps(inv, indent=2 if a.pretty else None, ensure_ascii=False, default=str)
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(js + "\n", encoding="utf-8")
        print(f"wrote {a.out}: {inv['totals']['files']} files, {len(inv['references'])} refs, "
              f"{len(inv['commands'])} commands, {len(inv['scripts'])} scripts, "
              f"{len(inv['warnings'])} warnings", file=sys.stderr)
    else:
        print(js)
    return 0


if __name__ == "__main__":
    sys.exit(main())
