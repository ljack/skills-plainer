#!/usr/bin/env python3
"""Serve the skills-plainer web app with the analysis store.

Serves app/ as static files and adds two endpoints:
  /api/index.json          every analysis (showcase + ~/.skills-plainer/analyses)
  /api/analysis/<id>.json  one analysis; the user store wins over the showcase
  /api/publish/...         status, preview and deploy through publish.py (loopback only)

Usage:
  serve.py [--port 7341] [--open [ID]] [--compare A B] [--host 127.0.0.1]

Binds to localhost only. Ctrl-C stops it.
"""
from __future__ import annotations

import argparse
import ipaddress
import http.client
import json
import re
import socket
import subprocess
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # the -I flag leaves this directory off sys.path
try:
    import rate  # noqa: E402
except ImportError:
    rate = None  # type: ignore[assignment]

BASE = Path(__file__).resolve().parent.parent
APP = BASE / "app"
SHOWCASE = APP / "analyses"
STORE = Path.home() / ".skills-plainer" / "analyses"
GROUPS = Path.home() / ".skills-plainer" / "groups.json"
PUBLISH_LOCK = threading.Lock()


def is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return host == "localhost"


def sources() -> dict[str, tuple[Path, str]]:
    found: dict[str, tuple[Path, str]] = {}
    for d, origin in ((SHOWCASE, "showcase"), (STORE, "yours")):
        if d.is_dir():
            for p in sorted(d.glob("*.json")):
                if p.name != "index.json":
                    found[p.stem] = (p, origin)
    return found


def load_groups() -> dict[str, list[str]]:
    """Group name to analysis ids, in display order."""
    try:
        return json.loads(GROUPS.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}


def group_of(sid: str, groups: dict[str, list[str]]) -> str:
    return next((g for g, ids in groups.items() if sid in ids), "Other")


def index_entry(sid: str, origin: str, a: dict, groups: dict[str, list[str]]) -> dict:
    inv = a.get("inventory", {})
    fm = inv.get("frontmatter", {})
    s = a.get("summary", {})
    sc = a.get("scorecard", [])
    return {
        "id": sid, "origin": origin, "group": group_of(sid, groups), "name": fm.get("name", sid),
        "version": fm.get("version"), "headline": s.get("headline"),
        "archetype": s.get("archetype"), "analyzedAt": a.get("analyzedAt"),
        "files": inv.get("totals", {}).get("files"),
        "commands": len(a.get("commands", [])),
        "onTrigger": inv.get("budget", {}).get("onTrigger"),
        "score": round(sum(x.get("score", 0) for x in sc) / max(1, len(sc)), 1) if sc else None,
        **(rate.index_fields(sid, a) if rate else {}),
    }


def index() -> list[dict]:
    out, groups = [], load_groups()
    for sid, (p, origin) in sources().items():
        try:
            a = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            out.append({"id": sid, "error": str(e), "origin": origin})
            continue
        out.append(index_entry(sid, origin, a, groups))
    return out


def run_publish(*args: str) -> tuple[int, dict]:
    pub_script = Path(__file__).with_name("publish.py")
    if not pub_script.is_file():
        return (200, {"enabled": False}) if args == ("status",) else (404, {"error": "publish.py is not installed"})
    r = subprocess.run([sys.executable, "-I", str(pub_script), "--json", *args],
                       capture_output=True, text=True, timeout=600)
    try:
        out = json.loads(r.stdout)
    except ValueError:
        return 500, {"error": (r.stderr or r.stdout or "publish failed")[-1500:]}
    return (400 if r.returncode and "error" in out else 200), out


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/site.json":  # the app's public-build probe; only a published site says yes
            return self._json({"published": False, "groups": list(load_groups())})
        if path == "/api/ping":
            return self._json(ping_info())
        if path == "/api/index.json":
            return self._json(index())
        if path == "/api/publish/status":
            if not is_loopback(self.server.server_address[0]):
                return self._json({"enabled": False})
            return self._json(run_publish("status")[1])
        if path.startswith("/api/source/"):
            return self._source(path[len("/api/source/"):], self.path)
        if path.startswith("/api/analysis/") and path.endswith(".json"):
            sid = path[len("/api/analysis/"):-5]
            src = sources().get(sid)
            if not src:
                return self._json({"error": f"no analysis '{sid}'"}, 404)
            a = json.loads(src[0].read_bytes())
            body = json.dumps({**a, **(rate.report_fields(sid, a) if rate else {})}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def _trusted(self) -> bool:
        """Only this app's own page may publish. A foreign site can reach localhost,
        but cannot set a matching Origin, and a JSON body forces a preflight this
        server refuses. The Host check stops DNS rebinding."""
        host, port = self.server.server_address[:2]
        if not is_loopback(host):
            return False
        names = {f"127.0.0.1:{port}", f"localhost:{port}"}
        return (self.headers.get("Host") in names
                and self.headers.get("Origin") in {f"http://{n}" for n in names}
                and self.headers.get("Content-Type", "").split(";")[0] == "application/json")

    def do_POST(self):
        m = re.fullmatch(r"/api/publish/([^/]+)/(preview|deploy)", self.path)
        if not m:
            return self._json({"error": "not found"}, 404)
        if not self._trusted():
            return self._json({"error": "publishing is only allowed from the local app"}, 403)
        sid, action = m.group(1), m.group(2)
        if sid not in sources():
            return self._json({"error": f"no analysis '{sid}'"}, 404)
        if action == "preview":
            return self._json(*reversed(run_publish("preview", sid)))
        if not PUBLISH_LOCK.acquire(blocking=False):
            return self._json({"error": "another publish is running"}, 409)
        try:
            state = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 1024)) or b"{}").get("state")
        except (ValueError, AttributeError):
            state = "bad"
        if state not in (None, "draft", "listed"):
            PUBLISH_LOCK.release()
            return self._json({"error": "unknown publish state"}, 400)
        try:
            code, out = run_publish("deploy", sid, *([f"--{state}"] if state else []))
        finally:
            PUBLISH_LOCK.release()
        return self._json(out, code)

    def _source(self, sid: str, raw: str):
        """Lines of one file of an analyzed skill. Only paths listed in that
        analysis' inventory are served, read from the inventory root."""
        from urllib.parse import parse_qs, urlparse
        q = parse_qs(urlparse(raw).query)
        rel = (q.get("path") or [""])[0]
        src = sources().get(sid)
        if not src or not rel:
            return self._json({"error": "unknown analysis or path"}, 404)
        try:
            inv = json.loads(src[0].read_text(encoding="utf-8")).get("inventory", {})
        except Exception:
            return self._json({"error": "unreadable analysis"}, 500)
        listed = {f["path"]: f for f in inv.get("files", [])}
        f = listed.get(rel)
        if not f or "lines" not in f:
            return self._json({"error": "not a text file of this skill"}, 404)
        root = Path(inv.get("root", "")).resolve()
        p = (root / rel).resolve()
        if root not in p.parents or not p.is_file():
            return self._json({"error": "source not available on this machine"}, 404)
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            return self._json({"error": str(e)}, 404)
        lines = text.split("\n")
        return self._json({"path": rel, "total": len(lines), "lines": lines[:6000],
                           "truncated": len(lines) > 6000})


def ping_info() -> dict:
    return {"app": "skills-plainer", "base": str(BASE), "rev": int(Path(__file__).stat().st_mtime)}


def running_server(host: str, start: int) -> int | None:
    """Port of a server already running from this same code, if any. Analyses
    are read from disk per request, so it serves anything just written."""
    for p in range(start, start + 10):
        conn = http.client.HTTPConnection(host, p, timeout=0.4)
        try:
            conn.request("GET", "/api/ping")
            res = conn.getresponse()
            if res.status == 200 and json.loads(res.read()) == ping_info():
                return p
        except (OSError, ValueError, http.client.HTTPException):
            pass
        finally:
            conn.close()
    return None


def free_port(host: str, start: int) -> int:
    for p in range(start, start + 50):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)  # match the server; ignore TIME_WAIT
            try:
                s.bind((host, p))
                return p
            except OSError:
                continue
    raise SystemExit("no free port")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=7341)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--open", nargs="?", const="", default=None, metavar="ID")
    ap.add_argument("--compare", nargs=2, metavar=("A", "B"))
    a = ap.parse_args(argv)
    STORE.mkdir(parents=True, exist_ok=True)
    route = ""
    if a.compare:
        route = f"#/compare/{a.compare[0]}/{a.compare[1]}"
    elif a.open:
        route = f"#/{a.open}"
    existing = running_server(a.host, a.port)
    if existing:
        url = f"http://{a.host}:{existing}/"
        print(f"skills-plainer already serving {url}{route}", flush=True)
        if a.open is not None or a.compare:
            webbrowser.open(url + route)
        return 0
    port = free_port(a.host, a.port)
    httpd = ThreadingHTTPServer((a.host, port), partial(Handler, directory=str(APP)))
    url = f"http://{a.host}:{port}/"
    print(f"skills-plainer serving {url}{route}", flush=True)
    print(f"analyses: {len(sources())} ({SHOWCASE} + {STORE})", flush=True)
    if a.open is not None or a.compare:
        threading.Timer(0.4, lambda: webbrowser.open(url + route)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
