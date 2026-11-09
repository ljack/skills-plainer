// skills-plainer web app: renders skills-plainer/analysis@1 JSON as a transit-diagram reader.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $("#app");

// ------------------------------------------------------------ palette
const ROUTE_C = ["#ee352e", "#0039a6", "#00933c", "#fccc0a", "#996633", "#6cbe45", "#00add0", "#b933ad"];
const DARK_INK = new Set(["#fccc0a", "#6cbe45", "#a7a9ac", "#00add0", "#ff6319"]);
const ROLE = {
  skill: { c: "#141414", label: "SKILL.md" },
  reference: { c: "#0039a6", label: "Reference" },
  agent: { c: "#b933ad", label: "Agent" },
  script: { c: "#00933c", label: "Script" },
  data: { c: "#fccc0a", label: "Data" },
  asset: { c: "#ff6319", label: "Asset" },
  binary: { c: "#808183", label: "Binary" },
  license: { c: "#a7a9ac", label: "License" },
  other: { c: "#996633", label: "Other" },
};
const TIER = {
  always: { c: "#b933ad", l: "A", name: "Always" },
  trigger: { c: "#141414", l: "T", name: "On trigger" },
  demand: { c: "#0039a6", l: "D", name: "On demand" },
  execute: { c: "#00933c", l: "X", name: "Executed" },
};
const RUBRIC = {
  "trigger-precision": ["Trigger precision", "Fires on the right prompts, quiet on the wrong ones"],
  "progressive-disclosure": ["Progressive disclosure", "Context cost scales with the request"],
  "routing-clarity": ["Routing clarity", "The model knows which path to take, fast"],
  "instruction-quality": ["Instruction quality", "Specific, reasoned, consistent"],
  determinism: ["Determinism", "Fragile work done by scripts, not prose"],
  safety: ["Safety", "Side effects disclosed, bounded, gated"],
  "user-control": ["User control", "Asks at the right moments only"],
  maintainability: ["Maintainability", "Easy to change without breaking"],
  portability: ["Portability", "Works across harnesses and setups"],
};

// ------------------------------------------------------------ helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const txt = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
const base = (p) => String(p).split("/").pop();
const dir = (p) => { const a = String(p).split("/"); a.pop(); return a.join("/"); };
const tok = (n) => n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n);
const bytes = (n) => n == null ? "–" : n >= 1e6 ? (n / 1e6).toFixed(1) + " MB" : n >= 1e3 ? Math.round(n / 1e3) + " kB" : n + " B";
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const bullet = (letter, c, extra = "") => `<span class="bullet ${DARK_INK.has(c) ? "dark-ink" : ""} ${extra}" style="--c:${c}" aria-hidden="true"><span>${esc(letter)}</span></span>`;
const tierBullet = (t) => bullet(TIER[t].l, TIER[t].c, "diamond");
const letterOf = (s) => (String(s).replace(/[^a-z0-9]/gi, "")[0] || "?").toUpperCase();

const ICON = {
  read: '<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3M6 8h4M6 11h4"/>',
  write: '<path d="M10.5 2.5l3 3-8 8h-3v-3z"/><path d="M9 4l3 3"/>',
  exec: '<path d="M5 3l8 5-8 5z"/>',
  network: '<circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2.4 2.4 2.4 10.6 0 13M8 1.5c-2.4 2.4-2.4 10.6 0 13"/>',
  spawn: '<circle cx="4" cy="3" r="1.6"/><circle cx="4" cy="13" r="1.6"/><circle cx="12" cy="5" r="1.6"/><path d="M4 4.6v6.8M12 6.6c0 3.2-8 1.8-8 4.8"/>',
  ask: '<path d="M2.5 3h11v8h-6l-3 2.8V11h-2z"/><path d="M8 8.6v.1"/><path d="M6.6 5.6a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.8.6-.8 1"/>',
  browser: '<rect x="1.5" y="2.5" width="13" height="11"/><path d="M1.5 5.5h13"/>',
  server: '<rect x="2" y="2.5" width="12" height="4.5"/><rect x="2" y="9" width="12" height="4.5"/><path d="M4.5 4.75h.1M4.5 11.25h.1"/>',
  decide: '<path d="M8 1.5l6.5 6.5L8 14.5 1.5 8z"/>',
  verify: '<path d="M2.5 8.5l3.5 3.5 7.5-8"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">${ICON[k] || ICON.read}</svg>`;
const MARK = {
  high: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5L15 14.5H1z" fill="#ee352e"/></svg>',
  medium: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1L15 8 8 15 1 8z" fill="#ff6319"/></svg>',
  low: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" fill="none" stroke="#141414" stroke-width="3"/></svg>',
  info: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" fill="#808183"/></svg>',
  yes: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#00933c"/><path d="M4.8 8.2l2.2 2.2 4.2-4.6" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  no: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#141414" stroke-width="2"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#141414" stroke-width="2"/></svg>',
};

// ------------------------------------------------------------ data
const ROOT = document.body.dataset.root || "";
const cache = new Map();
let isPublic = false, pub = null, site = null; // isPublic: this is the published snapshot. pub: local publish state. site: api/site.json.
async function getJSON(urls) {
  let last;
  for (const u of urls) {
    try { const r = await fetch(u, { cache: "no-store" }); if (r.ok) return await r.json(); last = new Error(`${u}: ${r.status}`); } catch (e) { last = e; }
  }
  throw last;
}
const getIndex = () => getJSON([`${ROOT}api/index.json`, `${ROOT}analyses/index.json`]);
async function getAnalysis(id) {
  if (!cache.has(id)) cache.set(id, getJSON([`${ROOT}api/analysis/${encodeURIComponent(id)}.json`, `${ROOT}analyses/${encodeURIComponent(id)}.json`]).then(prep));
  return cache.get(id);
}
function prep(a) {
  const inv = a.inventory || {};
  a._files = new Map((inv.files || []).map((f) => [f.path, f]));
  a._routes = (a.routes || []).map((r, i) => ({ ...r, i, c: ROUTE_C[i % ROUTE_C.length], stops: [...new Set(r.stops || [])] }));
  a._comp = new Map((a.components || []).map((c) => [c.path, c]));
  a._scr = new Map((a.scripts || []).map((c) => [c.path, c]));
  return a;
}

const cleanQuote = (q) => String(q).replace(/\*\*|__|(?<![\w*])\*(?!\s)|(?<!\s)\*(?![\w*])/g, "").replace(/^[\s"“”']+|[\s"“”']+$/g, "");

// ------------------------------------------------------------ chips
const ev = (e) => !e || !e.file ? "" : e.kind === "strings" || e.kind === "inferred" ? `<button type="button" class="ev" data-file="${esc(e.file)}" title="${esc(e.note || e.kind)}">${esc(e.file)} · ${e.kind === "strings" ? "read from binary" : "inferred"}</button>` : `<button type="button" class="ev" data-file="${esc(e.file)}" data-line="${e.line || ""}" title="Open ${esc(e.file)}${e.line ? " at line " + e.line : ""}">${esc(e.file)}${e.line ? ":" + e.line : ""}${e.end ? "–" + e.end : ""}</button>`;
const evs = (list) => (list || []).map(ev).join("");
function fileChip(a, p) {
  const f = a._files.get(p.split("#")[0]);
  const c = ROLE[f?.role || "other"].c;
  return `<button type="button" class="filechip" style="--c:${c}" data-file="${esc(p.split("#")[0])}" title="${esc(p)}"><i></i>${esc(base(p))}</button>`;
}

// ------------------------------------------------------------ transit map
// Each file a station on its own row; each route a coloured line through its stops.
function transitMap(a, { size = "lg", idp = "m" } = {}) {
  const routes = a._routes;
  if (!routes.length) return `<p class="note">No routes recorded in this analysis.</p>`;
  const lg = size === "lg";
  const LW = lg ? 8 : 6, GAP = LW + 3, LANE = lg ? 38 : 26, ROW = lg ? 46 : 38, R = lg ? 9 : 7.5;
  const nodes = new Map();
  routes.forEach((r) => r.stops.forEach((p) => { if (!nodes.has(p)) nodes.set(p, { p, rs: [] }); nodes.get(p).rs.push(r.i); }));
  // longest-path layering from the first stop
  const layer = new Map();
  routes.forEach((r) => layer.set(r.stops[0], 0));
  for (let k = 0; k < nodes.size; k++) {
    let ch = false;
    for (const r of routes) for (let j = 1; j < r.stops.length; j++) {
      const la = layer.get(r.stops[j - 1]) ?? 0, lb = layer.get(r.stops[j]);
      if ((lb === undefined || lb < la + 1) && la + 1 < nodes.size) { layer.set(r.stops[j], la + 1); ch = true; }
    }
    if (!ch) break;
  }
  const n = routes.length, home = (i) => i - (n - 1) / 2;
  const list = [...nodes.values()];
  list.forEach((d) => { d.layer = layer.get(d.p) ?? 0; d.lane = d.rs.reduce((s, i) => s + home(i), 0) / d.rs.length; });
  list.sort((x, y) => x.layer - y.layer || x.lane - y.lane || x.p.localeCompare(y.p));
  const minLane = Math.min(...list.map((d) => d.lane)), maxLane = Math.max(...list.map((d) => d.lane));
  const padX = 22 + ((n - 1) * GAP) / 2;
  const x0 = padX - minLane * LANE;
  const top = routes.some((r) => r.stops.length === 1) ? (lg ? 44 : 36) : 26; // room for a stub above the first station
  list.forEach((d, row) => { d.x = x0 + d.lane * LANE; d.y = top + row * ROW; });
  const labelX = x0 + maxLane * LANE + padX + 14;
  const W = labelX + (lg ? 250 : 190), H = top + list.length * ROW;
  const off = (d, i) => { const k = d.rs.indexOf(i); return (k - (d.rs.length - 1) / 2) * GAP; };

  const seg = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 0.5) return `L${bx} ${by}`;
    if (ady >= adx) { const s = (ady - adx) / 2, sy = Math.sign(dy); return `L${ax} ${ay + s * sy} L${bx} ${by - s * sy} L${bx} ${by}`; }
    const s = (adx - ady) / 2, sx = Math.sign(dx); return `L${ax + s * sx} ${ay} L${bx - s * sx} ${by} L${bx} ${by}`;
  };
  const lines = routes.map((r) => {
    const pts = r.stops.map((p) => { const d = nodes.get(p); return [d.x + off(d, r.i), d.y]; });
    let path = `M${pts[0][0]} ${pts[0][1]}`;
    for (let j = 1; j < pts.length; j++) path += " " + seg(pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1]);
    if (pts.length === 1) path += ` L${pts[0][0]} ${pts[0][1] - top + 10}`; // a route that never leaves its first file ends in a stub
    return `<path class="line" data-r="${r.i}" d="${path}" stroke="${r.c}" style="--lw:${LW}"/>`;
  }).join("");
  const stns = list.map((d) => {
    const f = a._files.get(d.p);
    const w = (d.rs.length - 1) * GAP + R * 2;
    const ran = f && ["script", "binary"].includes(f.role);
    const t = f ? (ran ? `${bytes(f.bytes)}, run` : f.tokens != null ? `${tok(f.tokens)} tok` : bytes(f.bytes)) : "";
    const rcls = d.rs.map((i) => "r" + i).join(" ");
    return `<rect class="stn ${rcls}" data-file="${esc(d.p)}" tabindex="0" role="button" aria-label="${esc(d.p)}, ${esc(t)}, on ${d.rs.length} route${d.rs.length > 1 ? "s" : ""}" x="${d.x - w / 2}" y="${d.y - R}" width="${w}" height="${R * 2}" rx="${R}"/>
<text class="lbl ${d.p === "SKILL.md" ? "big" : ""} ${rcls}" x="${labelX}" y="${d.y + (lg ? 1 : 0)}">${esc(base(d.p))}</text>
<text class="lbl sm ${rcls}" x="${labelX}" y="${d.y + (lg ? 16 : 14)}">${esc(dir(d.p) ? dir(d.p) + "/ · " : "")}${esc(t)}</text>`;
  }).join("");
  const xMax = Math.max(...list.map((d) => d.x + ((d.rs.length - 1) * GAP) / 2 + R));
  const leaders = list.map((d) => `<path class="lbl r-lead ${d.rs.map((i) => "r" + i).join(" ")}" d="M${xMax + 6} ${d.y} H${labelX - 8}" stroke="#c9c9c9" stroke-width="1" stroke-dasharray="1 3" fill="none"/>`).join("");
  return `<svg class="tmap" id="${idp}" viewBox="0 0 ${W} ${H}" width="${W}" style="max-width:100%" role="group" aria-label="Load map: ${routes.length} routes through ${list.length} files">${leaders}${lines}${stns}</svg>`;
}
function legend(a, idp) {
  return `<ul class="legend" data-map="${idp}">${a._routes.map((r) => `<li><button type="button" data-route="${r.i}" aria-pressed="false">${bullet(letterOf(r.label), r.c)}<span><b>${esc(r.label)}</b>${r.when ? `<span class="w">${esc(r.when)}</span>` : ""}</span></button></li>`).join("")}</ul>`;
}

// ------------------------------------------------------------ treemap
function squarify(items, W, H) {
  const out = []; let x = 0, y = 0, w = W, h = H;
  const total = items.reduce((s, d) => s + d.v, 0) || 1;
  const scaled = items.map((d) => ({ ...d, area: (d.v / total) * W * H }));
  const worst = (row, side) => { const s = row.reduce((a, d) => a + d.area, 0); let mx = 0, mn = Infinity; row.forEach((d) => { mx = Math.max(mx, d.area); mn = Math.min(mn, d.area); }); return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn)); };
  const place = (row) => {
    const s = row.reduce((a, d) => a + d.area, 0);
    if (w >= h) { const cw = s / h; let cy = y; row.forEach((d) => { const ch = d.area / cw; out.push({ ...d, x, y: cy, w: cw, h: ch }); cy += ch; }); x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; row.forEach((d) => { const cw = d.area / rh; out.push({ ...d, x: cx, y, w: cw, h: rh }); cx += cw; }); y += rh; h -= rh; }
  };
  let row = [];
  for (const d of scaled) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, d], side) <= worst(row, side)) row.push(d);
    else { place(row); row = [d]; }
  }
  if (row.length) place(row);
  return out;
}
// references and agents shade by hops from SKILL.md; orphans go grey
const DEPTH_C = ["#141414", "#0039a6", "#2f6fd6", "#5b8fe0"];
function shade(f) {
  if (f.role === "reference" || f.role === "agent") {
    if (f.depth == null) return "#808183";
    if (f.role === "agent") return "#b933ad";
    return DEPTH_C[Math.min(f.depth, 3)];
  }
  return ROLE[f.role]?.c || ROLE.other.c;
}
function drawTreemap(a) {
  const box = $("#treemap"); if (!box) return;
  const mode = box.dataset.mode;
  const files = (a.inventory.files || []).filter((f) => mode === "context" ? ["skill", "reference", "agent"].includes(f.role) : true);
  const items = files.map((f) => ({ f, v: mode === "context" ? f.tokens || 0 : f.bytes || 0 })).filter((d) => d.v > 0).sort((p, q) => q.v - p.v);
  const W = box.clientWidth - 4, H = box.clientHeight - 4;
  box.innerHTML = squarify(items, W, H).map((t) => {
    const c = shade(t.f), small = t.w < 70 || t.h < 38;
    const val = mode === "context" ? `${tok(t.f.tokens)} tok` : bytes(t.f.bytes);
    return `<button type="button" class="tile ${DARK_INK.has(c) ? "dark-ink" : ""}" data-file="${esc(t.f.path)}" style="--c:${c};left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px" title="${esc(t.f.path)} · ${val}" aria-label="${esc(t.f.path)}, ${val}">${small ? "" : `<b>${esc(base(t.f.path))}</b><span>${val}</span>`}</button>`;
  }).join("");
}

// ------------------------------------------------------------ views
function pubControl(id) {
  if (!pub?.enabled || !id) return "";
  const live = pub.published?.[id], draft = live?.state === "draft";
  return `${live ? `<a href="${esc(live.share)}" target="_blank" rel="noopener">${draft ? "Draft page" : "Live page"}</a>` : ""}<button type="button" class="pub-btn" data-publish="${esc(id)}">${!live ? "Publish draft" : draft ? "Update draft" : "Update live page"}</button>`;
}
function topbar(active, id) {
  return `<nav class="topbar" aria-label="App"><a class="brand" href="#/">${bullet("S", "#ee352e")}skills-plainer</a><span class="spacer"></span>${pubControl(id)}<a href="#/" ${active === "home" ? 'aria-current="page"' : ""}>Analyses</a><a href="#/compare" ${active === "compare" ? 'aria-current="page"' : ""}>Compare</a><a href="https://github.com/ljack/skills-plainer" target="_blank" rel="noopener">GitHub</a><a href="https://jarkkolietolahti.com" target="_blank" rel="noopener">By Jarkko Lietolahti</a></nav>`;
}

function comingSoon() {
  const local = Object.entries(pub?.published || {}).filter(([, e]) => e.state === "draft" && e.listAfter).map(([name, e]) => ({ name, listAfter: e.listAfter }));
  const n = isPublic ? site?.next : local.sort((p, q) => p.listAfter.localeCompare(q.listAfter))[0];
  if (!n) return `Coming soon: another &ldquo;splained skill&rdquo; within 24 hours`;
  const h = Math.max(1, Math.ceil((new Date(n.listAfter) - Date.now()) / 36e5));
  return `Coming soon &ldquo;splained skill ${esc(n.name)}&rdquo; in ${h} ${h === 1 ? "hour" : "hours"}`;
}

async function viewHome() {
  let idx = [];
  try { idx = await getIndex(); } catch { /* shown below */ }
  document.title = "skills-plainer · how skills work, taken apart";
  const skills = idx.filter((d) => !d.error).map((d) => ({ ...d, group: d.group || "Other" }));
  const drafts = site?.drafts || {};
  const order = [...new Set([...(site?.groups || []), ...skills.map((d) => d.group), ...Object.keys(drafts)])].filter((g) => drafts[g] || skills.some((d) => d.group === g));
  let lineNo = 0;
  const pubState = (id) => { const p = pub?.published?.[id]; return p ? (p.state === "draft" ? " · draft" : " · public") : ""; };
  const row = (d) => `<li><a class="line-row" href="#/${esc(d.id)}">${bullet(letterOf(d.name), ROUTE_C[lineNo++ % ROUTE_C.length])}
    <div><h3>${esc(d.name)}</h3><div class="arch">${esc(d.archetype || "")}${d.version ? " · v" + esc(d.version) : ""}${d.origin === "showcase" ? " · showcase" : ""}${pubState(d.id)}</div></div>
    <p class="hl">${txt(d.headline || "")}</p>
    <div class="stat"><b>${d.files ?? "–"}</b>files</div><div class="stat"><b>${tok(d.onTrigger)}</b>tokens on trigger</div><div class="stat"><b>${d.score != null ? Number(d.score).toFixed(1) : "–"}</b>avg score / 5</div></a></li>`;
  const groups = order.map((g) => {
    const items = skills.filter((d) => d.group === g).sort((p, q) => p.name.localeCompare(q.name));
    const n = drafts[g] || 0;
    return `<section class="line-group"><div class="group-head"><h2>${esc(g)}</h2>${n ? `<span class="draft-count">${n} ${n === 1 ? "draft" : "drafts"}</span>` : ""}</div>${items.length ? `<ol class="lines" aria-label="${esc(g)}">${items.map(row).join("")}</ol>` : ""}</section>`;
  }).join("");
  const opts = skills.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("");
  app.innerHTML = `${topbar("home")}
  <p class="draft-note">${comingSoon()}</p>
  <header class="sign"><div class="sign-in">${bullet("S", "#ee352e")}<div class="sign-title"><h1>skills-plainer</h1><span class="ver">how skills work, taken apart</span></div></div></header>
  <div class="home">
    <div class="home-lede">
      <div class="prose"><p class="lede">Every skill is a network of files. Here is the map.</p>
      <p>An agent skill is a folder: a <code>SKILL.md</code> whose description decides when it fires, plus references, scripts and assets it may or may not reach. skills-plainer reads that folder, never runs it, and draws what loads, what runs and what to borrow, with every claim cited to a file and line.</p></div>
      ${isPublic ? `<div class="howto"><h2>Analyze your own skills</h2><pre><span>#</span> install for Claude Code
git clone https://github.com/ljack/skills-plainer.git
ln -s "$PWD/skills-plainer/skills-plainer" ~/.claude/skills/skills-plainer
/skills-plainer analyze &lt;skill&gt;</pre><p>Open source on <a href="https://github.com/ljack/skills-plainer" target="_blank" rel="noopener">GitHub</a> · Built by <a href="https://jarkkolietolahti.com" target="_blank" rel="noopener">Jarkko Lietolahti</a>.</p></div>` : `<div class="howto"><h2>Analyze your own</h2><pre><span>#</span> in Claude Code
/skills-plainer analyze &lt;skill&gt;
/skills-plainer trace &lt;skill&gt; "a prompt"
/skills-plainer compare &lt;a&gt; &lt;b&gt;</pre><p>Analyses land in <code>~/.skills-plainer/analyses/</code> and show up here.</p></div>`}
    </div>
    ${groups || (isPublic ? `<div class="state"><h1>Nothing published right now</h1></div>` : `<div class="state"><h1>No analyses yet</h1><p>Run <code>/skills-plainer analyze &lt;skill&gt;</code> in Claude Code, then reload. The app needs <code>scripts/serve.py</code> running, or the showcase files in <code>app/analyses/</code>.</p></div>`)}
    ${idx.length > 1 ? `<form class="compare-pick" id="cmpform"><h2>Compare two lines</h2><label class="sr" for="ca">First skill</label><select id="ca">${opts}</select><label class="sr" for="cb">Second skill</label><select id="cb">${opts}</select><button class="btn" type="submit">Compare</button></form>` : ""}
  </div>`;
  const f = $("#cmpform");
  if (f) { $("#cb").selectedIndex = Math.min(1, idx.length - 1); f.addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/compare/${$("#ca").value}/${$("#cb").value}`; }); }
}

const SECTIONS = [
  { zone: "plain", id: "overview", t: "In plain words", s: "What it does, what it touches" },
  { zone: "plain", id: "trigger", t: "When it fires", s: "The description, dissected" },
  { zone: "internals", id: "loadmap", t: "Load map", s: "What enters context, when" },
  { zone: "internals", id: "commands", t: "Commands", s: "Sub-commands and their files" },
  { zone: "internals", id: "toolbox", t: "Tools it drives", s: "What does the work" },
  { zone: "internals", id: "lifecycle", t: "One request", s: "Start to finish, step by step" },
  { zone: "internals", id: "anatomy", t: "Anatomy", s: "Every file, by weight" },
  { zone: "internals", id: "scripts", t: "Scripts", s: "What runs on your machine" },
  { zone: "internals", id: "patterns", t: "Patterns to borrow", s: "Design moves worth stealing" },
  { zone: "internals", id: "guardrails", t: "Guardrails", s: "Rules that bind the model" },
  { zone: "internals", id: "risks", t: "Risks", s: "What to watch for" },
  { zone: "internals", id: "scorecard", t: "Scorecard", s: "Nine criteria, 0 to 5" },
  { zone: "internals", id: "glossary", t: "Glossary", s: "The skill's own words" },
  { zone: "end", id: "verdict", t: "Verdict", s: "End of the line" },
];

function rail(a, present) {
  const zones = [["plain", "Plain words", "#ee352e"], ["internals", "Internals", "#0039a6"], ["end", "Terminus", "#141414"]];
  const layer = document.body.dataset.layer;
  return `<nav class="rail" aria-label="Sections">
  <div class="layer-switch" role="group" aria-label="Reading depth"><button type="button" data-layer="plain" aria-pressed="${layer === "plain"}">Plain words</button><button type="button" data-layer="full" aria-pressed="${layer === "full"}">Everything</button></div>
  <div class="rail-zones">${zones.map(([z, label, c]) => {
    const items = SECTIONS.filter((s) => s.zone === z && present.has(s.id));
    if (!items.length) return "";
    return `<div class="rail-zone ${z === "internals" ? "internal" : ""}" style="--zc:${c}"><div class="rail-zone-label">${label}</div><ol>${items.map((s, k) => `<li>${k === 0 && z !== "plain" ? '<span class="transfer" aria-hidden="true"></span>' : ""}<a href="#/${esc(a.id)}/${s.id}" data-sec="${s.id}">${esc(s.t)}<small>${esc(s.s)}</small></a></li>`).join("")}</ol></div>`;
  }).join("")}</div></nav>`;
}

function secHead(id, title, aside = "", zoneColor = "#0039a6") {
  return `<div class="sec-head">${bullet(letterOf(title), zoneColor)}<h2 id="h-${id}">${esc(title)}</h2>${aside ? `<div class="aside">${aside}</div>` : ""}</div>`;
}

function vOverview(a) {
  const s = a.summary || {}, b = a.inventory.budget || {};
  return `<section class="sec" id="s-overview" aria-labelledby="h-overview">${secHead("overview", "In plain words", esc(s.archetype ? `Archetype: ${s.archetype}` : ""), "#ee352e")}
  <div class="overview"><div>
    <p class="lede">${txt(s.headline)}</p>
    <div class="zones" aria-label="Context cost">
      ${["always", "trigger", "demand"].map((t) => `<span class="zone-chip">${tierBullet(t)}${TIER[t].name}: <b>${tok(b[t === "always" ? "always" : t === "trigger" ? "onTrigger" : "onDemand"])}</b> tokens</span>`).join("")}
      <span class="zone-chip">${tierBullet("execute")}Executed: <b>${b.externalTools && !b.executedBytes ? `${b.externalTools} outside` : bytes(b.executedBytes)}</b></span>
    </div>
    <div class="prose">${(s.plain || []).map((p) => `<p>${txt(p)}</p>`).join("")}</div>
    ${(s.touches || []).length ? `<h3 class="subhead">What it touches</h3><ul class="touches">${s.touches.map((t) => `<li><span class="touch-k">${icon(t.kind)}${esc(t.kind)}</span><span>${txt(t.what)}</span></li>`).join("")}</ul>` : ""}
    ${(s.forAuthors || []).length ? `<div class="internal"><h3 class="subhead">For skill authors</h3><div class="prose">${s.forAuthors.map((p) => `<p>${txt(p)}</p>`).join("")}</div></div>` : ""}
  </div>
  <aside class="overview-map" aria-label="Load map"><h3 class="map-title">Load map <a href="#/${esc(a.id)}/loadmap">Full map</a></h3>${transitMap(a, { size: "sm", idp: "map-sm" })}${legend(a, "map-sm")}</aside></div></section>`;
}

function vTrigger(a) {
  const t = a.trigger || {}, desc = a.inventory.frontmatter?.description || "";
  const RC = { what: "#141414", when: "#ee352e", verbs: "#0039a6", objects: "#00933c", domain: "#996633", negative: "#ff6319", boundary: "#ff6319" };
  let html = "", pos = 0;
  for (const p of t.phrases || []) {
    const j = desc.indexOf(p.text, pos);
    if (j < 0) continue;
    html += esc(desc.slice(pos, j)) + `<span class="ph" data-role="${esc(p.role)}" style="--c:${RC[p.role] || "#141414"}" title="${esc(p.role)}">${esc(p.text)}</span>`;
    pos = j + p.text.length;
  }
  html += esc(desc.slice(pos));
  const roles = [...new Set((t.phrases || []).map((p) => p.role))];
  const inv = t.invocation || {}, d = a.inventory.description || {};
  return `<section class="sec" id="s-trigger" aria-labelledby="h-trigger">${secHead("trigger", "When it fires", `${d.chars ?? desc.length} characters · ~${d.tokens ?? "–"} tokens, always in context`, "#ee352e")}
  <div class="prose"><p>${txt(t.explanation)}</p></div>
  <h3 class="subhead">The description, as the model sees it</h3>
  <p class="desc">${html}</p>
  <div class="ph-key">${roles.map((r) => `<span><i style="--c:${RC[r] || "#141414"}"></i>${esc(r)}</span>`).join("")}</div>
  <div class="two">
    <div><h3 class="subhead">Boards here</h3><ul class="boardlist">${(t.fires || []).map((f) => `<li><span class="mk">${MARK.yes}</span><span>${txt(f)}</span></li>`).join("")}</ul></div>
    <div><h3 class="subhead">Should not board</h3><ul class="boardlist">${(t.nearMiss || []).map((f) => `<li><span class="mk">${MARK.no}</span><span>${txt(f.prompt)}<span class="why">${txt(f.why)}</span></span></li>`).join("")}</ul></div>
  </div>
  <dl class="facts">
    <div><dt>Model can invoke</dt><dd>${inv.model === false ? "No" : "Yes"}</dd></div>
    <div><dt>Slash command</dt><dd>${inv.user === false ? "No" : "/" + esc(a.inventory.frontmatter?.name || a.id)}</dd></div>
    ${inv.argumentHint ? `<div style="grid-column:span 2"><dt>Arguments</dt><dd class="mono">${esc(inv.argumentHint)}</dd></div>` : ""}
    <div><dt>Says when</dt><dd>${d.hasWhen ? "Yes" : "No"}</dd></div><div><dt>Says when not</dt><dd>${(d.negativeClauses || []).length ? "Yes" : "No"}</dd></div>
  </dl>
  ${(t.notes || []).length ? `<div class="internal"><h3 class="subhead">Notes</h3><div class="prose">${t.notes.map((n) => `<p>${txt(n)}</p>`).join("")}</div></div>` : ""}
  </section>`;
}

function vLoadmap(a) {
  const tiers = a.loadTiers || [], b = a.inventory.budget || {};
  const vals = { always: b.always || 0, trigger: b.onTrigger || 0, demand: b.onDemand || 0 };
  const sum = vals.always + vals.trigger + vals.demand || 1;
  return `<section class="sec internal" id="s-loadmap" aria-labelledby="h-loadmap">${secHead("loadmap", "Load map", "Token counts are estimates, ~4 characters per token")}
  <div class="fare">${tiers.map((t) => `<div class="fare-z"><div class="zhead">${tierBullet(t.tier)}${esc(t.label || TIER[t.tier]?.name)}</div>
    <div class="num">${t.tier === "execute" ? (b.externalTools && !(t.bytes ?? b.executedBytes) ? b.externalTools : bytes(t.bytes ?? b.executedBytes)) : tok(t.tokens ?? vals[t.tier])}<small>${t.tier === "execute" ? (b.externalTools && !(t.bytes ?? b.executedBytes) ? "tools outside" : "on disk") : "tokens"}</small></div><p>${txt(t.explanation)}</p></div>`).join("")}</div>
  <div class="fare-bar" role="img" aria-label="Share of instruction tokens: always ${Math.round((vals.always / sum) * 100)}%, on trigger ${Math.round((vals.trigger / sum) * 100)}%, on demand ${Math.round((vals.demand / sum) * 100)}%">${["always", "trigger", "demand"].map((t) => `<i style="flex:${vals[t] / sum};background:${TIER[t].c}"></i>`).join("")}</div>
  <div class="fare-scale"><span>Share of all instruction text, to scale</span><span>${tok(sum)} tokens in total</span></div>
  <div class="map-wide"><div class="map-wide-grid"><div>${transitMap(a, { size: "lg", idp: "map-lg" })}</div>
  <div><h3 class="map-title">Routes</h3>${legend(a, "map-lg")}<div id="route-detail" class="note" style="margin-top:16px" aria-live="polite">Point at a route to isolate it. Select a station to open the file.</div></div></div></div>
  </section>`;
}

function vCommands(a) {
  const cmds = a.commands || [];
  if (!cmds.length) return "";
  const groups = [...new Set(cmds.map((c) => c.group || "Commands"))];
  const name = a.inventory.frontmatter?.name || a.id;
  return `<section class="sec internal" id="s-commands" aria-labelledby="h-commands">${secHead("commands", "Commands", `${cmds.length} sub-commands · <code>/${esc(name)} &lt;command&gt;</code>`)}
  <div class="tbl-wrap"><table class="tbl cmds"><thead><tr><th scope="col">Command</th><th scope="col">Does</th><th scope="col">Loads</th><th scope="col">Example</th></tr></thead><tbody>
  ${groups.map((g, gi) => `<tr class="grp"><td colspan="4">${bullet(letterOf(g), ROUTE_C[gi % ROUTE_C.length])}${esc(g)}</td></tr>` + cmds.filter((c) => (c.group || "Commands") === g).map((c) => `<tr><td class="cmd">${esc(c.name)}</td><td class="does">${txt(c.does)}</td><td class="loads">${(c.loads || []).map((p) => fileChip(a, p)).join("")}</td><td class="ex">${esc(c.example || "")}</td></tr>`).join("")).join("")}
  </tbody></table></div></section>`;
}

function vToolbox(a) {
  const ext = a.inventory.externalTools || [];
  const rows = a.toolbox?.length ? a.toolbox : ext.map((t) => ({ name: t.name, need: "Named in the instructions; this analysis does not describe it." }));
  if (!rows.length) return "";
  const groups = [...new Set(rows.map((c) => c.group || "Tools"))];
  const dirs = [...new Set(ext.map((t) => t.path.slice(0, t.path.lastIndexOf("/"))))];
  const found = ext.filter((t) => t.exists).length;
  return `<section class="sec internal" id="s-toolbox" aria-labelledby="h-toolbox">${secHead("toolbox", "Tools it drives", `${rows.length} tool${rows.length === 1 ? "" : "s"}${ext.length ? " · outside the skill folder" : ""}`)}
  <div class="tbl-wrap"><table class="tbl cmds tools"><thead><tr><th scope="col">Tool</th><th scope="col">Use it for</th><th scope="col">Source</th><th scope="col">What decides it</th></tr></thead><tbody>
  ${groups.map((g, gi) => (groups.length > 1 ? `<tr class="grp"><td colspan="4">${bullet(letterOf(g), ROUTE_C[gi % ROUTE_C.length])}${esc(g)}</td></tr>` : "") + rows.filter((c) => (c.group || "Tools") === g).map((c) => `<tr><td class="cmd">${esc(c.name)}</td><td class="does">${txt(c.need)}</td><td class="loads">${evs(c.evidence)}</td><td class="ex">${txt(c.decision || "")}</td></tr>`).join("")).join("")}
  </tbody></table></div>${ext.length ? `<p class="note">${found} of ${ext.length} found on the machine that scanned this skill, in ${dirs.map((d) => `<code>${esc(d)}</code>`).join(", ")}. The scan checks that they exist and does not read or run their code.</p>` : ""}</section>`;
}

function vLifecycle(a) {
  const st = a.lifecycle || [];
  if (!st.length) return "";
  return `<section class="sec internal" id="s-lifecycle" aria-labelledby="h-lifecycle">${secHead("lifecycle", "One request, start to finish", `${st.length} steps`)}
  <ol class="steps">${st.map((s, k) => { const n = s.n ?? k + 1; return `<li class="step" id="step-${n}"><div class="step-n"><a href="#/${esc(a.id)}/step-${n}" aria-label="Step ${n}, link">${n}</a></div><div class="step-body"><h3>${esc(s.title)} <span class="kind">${icon(s.kind)}${esc(s.kind)}</span></h3><p>${txt(s.what)}</p><div class="refs">${(s.files || []).map((p) => fileChip(a, p)).join("")}${evs(s.evidence)}</div></div></li>`; }).join("")}</ol></section>`;
}

function vAnatomy(a) {
  const roles = a.inventory.roles || {};
  const t = a.inventory.totals || {};
  return `<section class="sec internal" id="s-anatomy" aria-labelledby="h-anatomy">${secHead("anatomy", "Anatomy", `${t.files} files · ${bytes(t.bytes)} · ${tok(t.tokens)} tokens of text`)}
  <div class="tm-bar"><div class="seg" role="group" aria-label="Size files by"><button type="button" data-tm="context" aria-pressed="true">Context weight (tokens)</button><button type="button" data-tm="disk" aria-pressed="false">Disk weight (bytes)</button></div>
  <div class="rolekey">${Object.entries(roles).filter(([r]) => r !== "reference").map(([r, v]) => `<span><i style="--c:${ROLE[r]?.c || ROLE.other.c}"></i>${esc(ROLE[r]?.label || r)} · ${v.files}</span>`).join("")}${roles.reference ? [1, 2, 3].filter((d) => (a.inventory.files || []).some((f) => f.role === "reference" && Math.min(f.depth ?? -1, 3) === d)).map((d) => `<span><i style="--c:${DEPTH_C[d]}"></i>Reference, ${d === 3 ? "3+ hops" : d + (d === 1 ? " hop" : " hops")}</span>`).join("") + ((a.inventory.orphans || []).length ? `<span><i style="--c:#808183"></i>Never linked · ${a.inventory.orphans.length}</span>` : "") : ""}</div></div>
  <div class="treemap" id="treemap" data-mode="context" role="group" aria-label="Files sized by weight"></div>
  ${(a.components || []).length ? `<h3 class="subhead">Notable files</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">File</th><th scope="col">Role</th><th scope="col">What it does</th><th scope="col">Size</th></tr></thead><tbody>${a.components.map((c) => { const f = a._files.get(c.path) || {}; return `<tr><td>${fileChip(a, c.path)}</td><td>${esc(c.role)}</td><td>${txt(c.explains)}</td><td class="ex">${f.tokens != null ? tok(f.tokens) + " tok" : bytes(f.bytes)}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
  ${(a.inventory.warnings || []).length ? `<h3 class="subhead">Scanner warnings</h3><ul class="risks">${a.inventory.warnings.map((w) => `<li class="risk"><span class="lv">${MARK.info}scan</span><p style="margin:0">${txt(w)}</p></li>`).join("")}</ul>` : ""}
  </section>`;
}

function vScripts(a) {
  const scr = a.scripts?.length ? a.scripts : [];
  const invS = new Map((a.inventory.scripts || []).map((s) => [s.path, s]));
  if (!scr.length && !invS.size) return "";
  const rows = (scr.length ? scr : [...invS.values()].map((s) => ({ path: s.path }))).map((s) => {
    const i = invS.get(s.path) || {}, caps = Object.keys(i.capabilities || {});
    const hot = new Set(["network", "filesystem-delete", "env-secrets", "llm-api", "subprocess"]);
    return `<article class="script"><div><h3>${fileChip(a, s.path)}</h3><div class="lang">${esc(i.language || "")}${i.functions ? ` · ${i.functions} functions` : ""}${a._files.get(s.path) ? ` · ${bytes(a._files.get(s.path).bytes)}` : ""}</div>
    <div class="caps">${caps.map((c) => `<span class="cap ${hot.has(c) ? "hot" : ""}" title="Lines ${(i.capabilities[c] || []).join(", ")}">${esc(c)}</span>`).join("") || '<span class="cap">no flagged capabilities</span>'}</div></div>
    <div>${s.does ? `<p>${txt(s.does)}</p>` : i.doc ? `<p>${txt(i.doc)}</p>` : ""}${s.invokedAs ? `<pre>${esc(s.invokedAs)}</pre>` : ""}${(s.touches || []).length ? `<p class="safety">${s.touches.map(txt).join(" · ")}</p>` : ""}${s.safety ? `<p class="safety">${txt(s.safety)}</p>` : ""}</div></article>`;
  }).join("");
  return `<section class="sec internal" id="s-scripts" aria-labelledby="h-scripts">${secHead("scripts", "Scripts", "Read, never run, by skills-plainer")}<div class="scripts">${rows}</div></section>`;
}

function vPatterns(a) {
  const p = a.patterns || [];
  if (!p.length) return "";
  return `<section class="sec internal" id="s-patterns" aria-labelledby="h-patterns">${secHead("patterns", "Patterns to borrow", `${p.length} patterns`)}
  <div class="patterns">${p.map((x, i) => `<article class="pattern"><h3>${bullet(letterOf(x.name), ROUTE_C[i % ROUTE_C.length])}${esc(x.name)}</h3>${x.id ? `<div class="pid">${esc(x.id)}</div>` : ""}<p>${txt(x.what)}</p>${x.steal ? `<p class="steal"><b>Steal it</b>${txt(x.steal)}</p>` : ""}<div class="refs" style="margin-top:10px">${evs(x.where)}</div></article>`).join("")}</div></section>`;
}

function vGuardrails(a) {
  const g = a.guardrails || [];
  if (!g.length) return "";
  return `<section class="sec internal" id="s-guardrails" aria-labelledby="h-guardrails">${secHead("guardrails", "Guardrails", `${g.length} rules quoted verbatim`)}
  <ul class="guards">${g.map((x) => `<li class="guard"><span class="bar" aria-hidden="true"></span><div><div class="rule">${txt(x.rule)}</div>${x.quote ? `<blockquote>“${esc(cleanQuote(x.quote))}”</blockquote>` : ""}<div class="refs">${ev(x.evidence)}</div></div></li>`).join("")}</ul></section>`;
}

function vRisks(a) {
  const r = a.risks || [];
  if (!r.length) return "";
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  return `<section class="sec internal" id="s-risks" aria-labelledby="h-risks">${secHead("risks", "Risks", ["high", "medium", "low", "info"].map((l) => { const n = r.filter((x) => x.level === l).length; return n ? `${MARK[l]} ${n} ${l}` : ""; }).filter(Boolean).join(" &nbsp; "))}
  <ul class="risks">${[...r].sort((x, y) => (order[x.level] ?? 9) - (order[y.level] ?? 9)).map((x) => `<li class="risk"><span class="lv">${MARK[x.level] || MARK.info}${esc(x.level)}</span><div><h3>${txt(x.title)}</h3><p>${txt(x.detail)}</p><div class="refs" style="margin-top:6px">${ev(x.evidence)}</div></div></li>`).join("")}</ul></section>`;
}

function dots(score, c = "#00933c") {
  const s = Math.max(0, Math.min(5, score | 0));
  return `<span class="dots" style="--c:${c}" role="img" aria-label="${s} of 5"><span class="fill" style="width:${s ? (s - 1) * 32 + 4 : 0}px"></span>${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= s ? "on" : ""} ${k === s ? "last" : ""}"></i>`).join("")}<span class="n">${s}</span></span>`;
}

function vScorecard(a) {
  const sc = a.scorecard || [];
  if (!sc.length) return "";
  const avg = sc.reduce((s, x) => s + (x.score || 0), 0) / sc.length;
  return `<section class="sec internal" id="s-scorecard" aria-labelledby="h-scorecard">${secHead("scorecard", "Scorecard", "Against the skills-plainer rubric")}
  <div class="score-total"><b>${avg.toFixed(1)}</b> average of ${sc.length} criteria, out of 5</div>
  <div>${sc.map((x) => { const [l, q] = RUBRIC[x.id] || [x.id, ""]; return `<div class="score"><div><h3>${esc(l)}</h3><div class="q">${esc(q)}</div></div>${dots(x.score)}<div><p>${txt(x.note)}</p>${x.fix ? `<p class="fix"><b>Fix</b>${txt(x.fix)}</p>` : ""}<div class="refs" style="margin-top:6px">${evs(x.evidence)}</div></div></div>`; }).join("")}</div></section>`;
}

function vGlossary(a) {
  const g = a.glossary || [];
  if (!g.length) return "";
  return `<section class="sec internal" id="s-glossary" aria-labelledby="h-glossary">${secHead("glossary", "Glossary", `${g.length} terms`)}<dl class="gloss">${g.map((x) => `<div><dt>${esc(x.term)}</dt><dd>${txt(x.meaning)}</dd></div>`).join("")}</dl></section>`;
}

function vVerdict(a) {
  const v = a.verdict || {};
  if (!Object.keys(v).length) return "";
  const list = (arr, mark) => `<ul>${(arr || []).map((s) => `<li>${mark}<span>${txt(s)}</span></li>`).join("")}</ul>`;
  return `<section class="sec" id="s-verdict" aria-labelledby="h-verdict">${secHead("verdict", "Verdict", "", "#141414")}
  <div class="terminus"><p class="best">${txt(v.bestFor)}</p>
  <div class="term-grid"><div><h3>Strengths</h3>${list(v.strengths, MARK.yes)}</div><div><h3>Weaknesses</h3>${list(v.weaknesses, MARK.high)}</div><div><h3>Lessons for authors</h3>${list(v.lessons, '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1L15 8 8 15 1 8z" fill="#fccc0a"/></svg>')}</div></div></div>
  <p class="note" style="margin-top:16px">Analyzed ${esc(a.analyzedAt)} by ${esc(a.analyzer || "skills-plainer")}. Read in full: ${(a.readInFull || []).map((p) => fileChip(a, p)).join("") || "not recorded"}</p></section>`;
}

function draftNote(a) {
  if (!a.draft) return "";
  let schedule = "Publication is not scheduled.";
  if (a.listAfter) {
    const date = new Date(a.listAfter);
    if (Number.isFinite(date.getTime())) {
      const label = new Intl.DateTimeFormat(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      }).format(date);
      schedule = `<b>Scheduled publication:</b> <time datetime="${esc(date.toISOString())}">${esc(label)}</time>. ${date <= Date.now() ? "Awaiting publication. " : ""}Publication checks run hourly.`;
    } else {
      schedule = "Publication time is unavailable.";
    }
  }
  return `<p class="draft-note"><b>Draft for review.</b> This page isn't listed on the site yet. Anyone with this link can read it.<span class="draft-schedule">${schedule}</span></p>`;
}

let current = null;
async function viewReader(id, anchor) {
  if (current?.id !== id) {
    app.innerHTML = `${topbar()}<div class="loading" role="status"><i></i>Loading ${esc(id)}</div>`;
    let a;
    try { a = await getAnalysis(id); } catch {
      app.innerHTML = `${topbar()}<div class="state"><h1>No analysis called “${esc(id)}”</h1>${isPublic ? "" : `<p>Create it with <code>/skills-plainer analyze ${esc(id)}</code> in Claude Code, then reload this page.</p>`}<p><a class="btn" href="#/">All analyses</a></p></div>`;
      current = null; return;
    }
    current = a;
    const fm = a.inventory.frontmatter || {}, b = a.inventory.budget || {}, sc = a.scorecard || [];
    const body = [vOverview(a), vTrigger(a), vLoadmap(a), vCommands(a), vToolbox(a), vLifecycle(a), vAnatomy(a), vScripts(a), vPatterns(a), vGuardrails(a), vRisks(a), vScorecard(a), vGlossary(a), vVerdict(a)].join("");
    const present = new Set([...body.matchAll(/id="s-([a-z]+)"/g)].map((m) => m[1]));
    document.title = `${fm.name || id} · skills-plainer`;
    app.innerHTML = `${topbar(undefined, id)}
    ${draftNote(a)}
    <header class="sign"><div class="sign-in">${bullet(letterOf(fm.name || id), "#ee352e")}<div class="sign-title"><h1>${esc(fm.name || id)}</h1>${fm.version ? `<span class="ver">v${esc(fm.version)}</span>` : ""}${/^https:\/\//.test(a.sourceUrl || "") ? `<a class="src-link" href="${esc(a.sourceUrl)}" target="_blank" rel="noopener noreferrer">${a.sourceUrl.includes("github.com") ? "Source on GitHub" : "Source"}</a>` : ""}</div>
      <div class="sign-meta"><div><b>${a.inventory.totals?.files ?? "–"}</b>files</div><div><b>${(a.commands || []).length || (a.toolbox || []).length || (a.inventory.externalTools || []).length}</b>${(a.commands || []).length || !((a.toolbox || []).length || (a.inventory.externalTools || []).length) ? "commands" : "tools"}</div><div><b>${tok(b.onTrigger)}</b>tokens on trigger</div>${sc.length ? `<div><b>${(sc.reduce((s, x) => s + x.score, 0) / sc.length).toFixed(1)}</b>avg score</div>` : ""}</div></div></header>
    <div class="reader">${rail(a, present)}<main id="main">${body}</main></div>`;
    afterRender(a);
  }
  scrollToAnchor(anchor);
}

function scrollToAnchor(anchor) {
  if (!anchor) { window.scrollTo({ top: 0 }); return; }
  const el = document.getElementById(anchor.startsWith("step-") ? anchor : "s-" + anchor);
  if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
}

function afterRender(a) {
  // draw-in for lines when a map enters view
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (!e.isIntersecting) return;
    $$(".line", e.target).forEach((p, k) => { const len = Math.ceil(p.getTotalLength()); p.style.setProperty("--len", len); p.style.setProperty("--d", `${k * 80}ms`); p.classList.add("draw"); });
    io.unobserve(e.target);
  }), { threshold: 0.25 });
  $$(".tmap").forEach((m) => io.observe(m));
  // scroll spy
  const links = new Map($$(".rail a[data-sec]").map((l) => [l.dataset.sec, l]));
  const spy = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((l) => l.removeAttribute("aria-current"));
      const l = links.get(e.target.id.slice(2)); if (!l) return;
      l.setAttribute("aria-current", "true");
      const rail = l.closest(".rail");
      if (!rail) return;
      const lr = l.getBoundingClientRect(), rr = rail.getBoundingClientRect();
      if (rail.scrollWidth > rail.clientWidth + 4) rail.scrollTo({ left: lr.left - rr.left + rail.scrollLeft - 24, behavior: "smooth" });
      else if (rail.scrollHeight > rail.clientHeight + 4) rail.scrollTo({ top: lr.top - rr.top + rail.scrollTop - rail.clientHeight / 2, behavior: "smooth" });
    });
  }, { rootMargin: "-20% 0px -70% 0px" });
  $$(".sec").forEach((s) => spy.observe(s));
  drawTreemap(a);
}

async function viewCompare(ida, idb) {
  let idx = [];
  try { idx = await getIndex(); } catch { /* ignore */ }
  if (!ida || !idb) { ida = idx[0]?.id; idb = idx[1]?.id; }
  if (!ida || !idb) { app.innerHTML = `${topbar("compare")}<div class="state"><h1>Two analyses needed</h1><p>${isPublic ? "Only one skill is published so far." : "Analyze a second skill to compare lines."}</p></div>`; return; }
  let A, B;
  try { [A, B] = await Promise.all([getAnalysis(ida), getAnalysis(idb)]); } catch {
    app.innerHTML = `${topbar("compare")}<div class="state"><h1>Could not load both analyses</h1><p><a class="btn" href="#/">All analyses</a></p></div>`; return;
  }
  current = null;
  document.title = `${ida} vs ${idb} · skills-plainer`;
  const C = ["#ee352e", "#0039a6"], both = [A, B];
  const max = (f) => Math.max(...both.map(f), 1);
  const bar = (v, m, c) => `<div class="cmpbar" style="--c:${c};width:${Math.max(1, (v / m) * 100)}%"></div>`;
  const metric = (label, f, fmt, unit = "") => { const m = max(f); return `<div class="lab">${label}</div>${both.map((x, i) => `<div><b style="font-size:24px;font-weight:800">${fmt(f(x))}</b> ${unit}${bar(f(x), m, C[i])}</div>`).join("")}`; };
  const pats = both.map((x) => new Set((x.patterns || []).map((p) => p.id || p.name)));
  const allP = [...new Set([...pats[0], ...pats[1]])];
  const pname = (id) => { for (const x of both) { const p = (x.patterns || []).find((q) => (q.id || q.name) === id); if (p) return p.name; } return id; };
  const opts = (sel) => idx.map((d) => `<option value="${esc(d.id)}" ${d.id === sel ? "selected" : ""}>${esc(d.name)}</option>`).join("");
  app.innerHTML = `${topbar("compare")}
  <header class="sign"><div class="sign-in"><span style="display:flex;gap:6px">${bullet(letterOf(A.inventory.frontmatter?.name || ida), C[0])}${bullet(letterOf(B.inventory.frontmatter?.name || idb), C[1])}</span><div class="sign-title"><h1>${esc(A.inventory.frontmatter?.name || ida)} <span style="color:#b8b8b8;font-weight:500">vs</span> ${esc(B.inventory.frontmatter?.name || idb)}</h1></div></div></header>
  <div class="cmp">
  <form class="compare-pick" id="cmpform" style="margin-top:0;border-top:0"><label class="sr" for="ca">First skill</label><select id="ca">${opts(ida)}</select><label class="sr" for="cb">Second skill</label><select id="cb">${opts(idb)}</select><button class="btn" type="submit">Compare</button></form>
  <div class="cmp-cols">
    <div class="lab"></div>${both.map((x, i) => `<div class="hd">${bullet(letterOf(x.inventory.frontmatter?.name || x.id), C[i])}<h2><a href="#/${esc(x.id)}">${esc(x.inventory.frontmatter?.name || x.id)}</a></h2></div>`).join("")}
    <div class="lab">Headline</div>${both.map((x) => `<div><p>${txt(x.summary?.headline)}</p></div>`).join("")}
    <div class="lab">Archetype</div>${both.map((x) => `<div><b>${esc(x.summary?.archetype)}</b></div>`).join("")}
    ${metric("Always in context", (x) => x.inventory.budget?.always || 0, tok, "tokens")}
    ${metric("On trigger", (x) => x.inventory.budget?.onTrigger || 0, tok, "tokens")}
    ${metric("On demand", (x) => x.inventory.budget?.onDemand || 0, tok, "tokens")}
    ${metric("Files", (x) => x.inventory.totals?.files || 0, String)}
    ${metric("Commands", (x) => (x.commands || []).length, String)}
    ${metric("Scripts", (x) => (x.inventory.scripts || []).length, String)}
    <div class="lab">Touches</div>${both.map((x) => `<div>${[...new Set((x.summary?.touches || []).map((t) => t.kind))].map((k) => `<span class="pill">${esc(k)}</span>`).join("")}</div>`).join("")}
    <div class="lab">Patterns</div>${both.map((x, i) => `<div>${allP.filter((p) => pats[i].has(p)).map((p) => `<span class="pill ${pats[0].has(p) && pats[1].has(p) ? "shared" : ""}">${esc(pname(p))}</span>`).join("")}</div>`).join("")}
  </div>
  <p class="note" style="margin:8px 0 0">Filled pills are patterns both skills use.</p>
  <h2 class="subhead" style="margin-top:48px">Scorecard</h2>
  ${Object.keys(RUBRIC).map((rid) => { const s = both.map((x) => (x.scorecard || []).find((q) => q.id === rid)); return `<div class="cmp-score"><div><b>${RUBRIC[rid][0]}</b></div><div>${s[0] ? dots(s[0].score, C[0]) : "–"}</div><div class="mid note">${s[0] && s[1] ? (s[0].score === s[1].score ? "even" : `${esc((s[0].score > s[1].score ? A : B).inventory.frontmatter?.name || "")} +${Math.abs(s[0].score - s[1].score)}`) : ""}</div><div>${s[1] ? dots(s[1].score, C[1]) : "–"}</div></div>`; }).join("")}
  </div>`;
  $("#cmpform").addEventListener("submit", (e) => { e.preventDefault(); location.hash = `#/compare/${$("#ca").value}/${$("#cb").value}`; });
}

// ------------------------------------------------------------ inspector
const insp = $("#insp");
let inspOpener = null;
async function openInspector(path, line) {
  const a = current; if (!a) return;
  const f = a._files.get(path);
  inspOpener = document.activeElement;
  const role = f?.role || "other", rc = ROLE[role]?.c || ROLE.other.c;
  $("#insp-bullet").outerHTML = `<span class="bullet ${DARK_INK.has(rc) ? "dark-ink" : ""}" id="insp-bullet" style="--c:${rc}" aria-hidden="true"><span>${esc(letterOf(ROLE[role]?.label || role))}</span></span>`;
  $("#insp-title").textContent = path;
  const refsIn = (a.inventory.references || []).filter((r) => r.to === path);
  const refsOut = (a.inventory.references || []).filter((r) => r.from === path);
  const routes = a._routes.filter((r) => r.stops.includes(path));
  const cmds = (a.commands || []).filter((c) => (c.loads || []).includes(path));
  const comp = a._comp.get(path), scr = a._scr.get(path), iscr = (a.inventory.scripts || []).find((s) => s.path === path);
  const uniq = (arr, k) => [...new Map(arr.map((x) => [x[k], x])).values()];
  $("#insp-body").innerHTML = !f ? `<p>This file is not in the inventory.</p>` : `
    <dl class="facts"><div><dt>Role</dt><dd>${esc(ROLE[role]?.label || role)}</dd></div><div><dt>Size</dt><dd>${bytes(f.bytes)}</dd></div>
    ${f.lines ? `<div><dt>Lines</dt><dd>${f.lines}</dd></div>` : ""}${f.tokens != null ? `<div><dt>Tokens</dt><dd>~${tok(f.tokens)}</dd></div>` : ""}
    <div><dt>Hops from SKILL.md</dt><dd>${f.depth ?? "unreached"}</dd></div><div><dt>Linked from</dt><dd>${f.inbound ?? 0} places</dd></div></dl>
    ${comp ? `<h3 class="subhead">What it does</h3><p style="font-family:var(--serif);font-size:17px;line-height:1.55">${txt(comp.explains)}</p>` : scr ? `<h3 class="subhead">What it does</h3><p style="font-family:var(--serif);font-size:17px;line-height:1.55">${txt(scr.does)}</p>` : ""}
    ${routes.length ? `<h3 class="subhead">On routes</h3><div>${routes.map((r) => `<span class="pill" style="border-color:${r.c}">${esc(r.label)}</span>`).join("")}</div>` : ""}
    ${cmds.length ? `<h3 class="subhead">Loaded by</h3><div>${cmds.map((c) => `<span class="pill mono">${esc(c.name)}</span>`).join("")}</div>` : ""}
    ${iscr && Object.keys(iscr.capabilities || {}).length ? `<h3 class="subhead">Capabilities the scanner saw</h3><ul>${Object.entries(iscr.capabilities).map(([k, ls]) => `<li><b>${esc(k)}</b>: ${ls.map((l) => `<button type="button" class="ev" data-file="${esc(path)}" data-line="${l}">${l}</button>`).join("")}</li>`).join("")}</ul>` : ""}
    ${(f.headings || []).length ? `<h3 class="subhead">Outline</h3><ul>${f.headings.filter((h) => h.level <= 3).slice(0, 40).map((h) => `<li style="margin-left:${(h.level - 1) * 12}px"><button type="button" class="ev" data-file="${esc(path)}" data-line="${h.line}">${h.line}</button>${esc(h.text)}</li>`).join("")}</ul>` : ""}
    ${refsIn.length ? `<h3 class="subhead">Linked from</h3><div>${uniq(refsIn, "from").map((r) => fileChip(a, r.from)).join("")}</div>` : ""}
    ${refsOut.length ? `<h3 class="subhead">Links to</h3><div>${uniq(refsOut, "to").map((r) => fileChip(a, r.to)).join("")}</div>` : ""}
    <h3 class="subhead">Source${line ? `, line ${line}` : ""}</h3><div id="insp-src" class="note">${f.lines ? "Loading source" : "Binary file; not shown."}</div>`;
  insp.classList.add("open"); insp.setAttribute("aria-hidden", "false");
  $("#insp-close").focus({ preventScroll: true });
  if (f?.lines) loadSource(a, path, line);
}
async function loadSource(a, path, line) {
  const box = $("#insp-src");
  if (isPublic) { box.textContent = "The source of this file is not published with the analysis."; return; }
  try {
    const r = await fetch(`api/source/${encodeURIComponent(a.id)}?path=${encodeURIComponent(path)}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const L = d.lines, hit = Number(line) || 0;
    const from = hit ? Math.max(1, hit - 12) : 1, to = hit ? Math.min(L.length, hit + 28) : Math.min(L.length, 120);
    const render = (a0, b0) => L.slice(a0 - 1, b0).map((s, k) => `<div class="${a0 + k === hit ? "hit" : ""}" ${a0 + k === hit ? 'id="src-hit"' : ""}><span>${a0 + k}</span><span>${esc(s) || " "}</span></div>`).join("");
    box.className = "";
    box.innerHTML = `<pre class="src" tabindex="0" aria-label="Source of ${esc(path)}">${render(from, to)}</pre>${to < L.length || from > 1 ? `<p style="margin-top:8px"><button type="button" class="btn" id="src-all">Show all ${L.length} lines</button></p>` : ""}`;
    $("#src-all")?.addEventListener("click", () => { $(".src", box).innerHTML = render(1, L.length); $("#src-all").remove(); $("#src-hit")?.scrollIntoView({ block: "center" }); });
    $("#src-hit")?.scrollIntoView({ block: "center" });
  } catch (e) {
    box.textContent = "Source is available when the app runs through scripts/serve.py on the machine where the skill is installed.";
  }
}
function closeInspector() {
  if (!insp.classList.contains("open")) return;
  insp.classList.remove("open"); insp.setAttribute("aria-hidden", "true");
  if (inspOpener && document.contains(inspOpener)) inspOpener.focus({ preventScroll: true });
}
$("#insp-close").addEventListener("click", closeInspector);

// ------------------------------------------------------------ events
document.addEventListener("click", (e) => {
  const pubEl = e.target.closest("[data-publish]");
  if (pubEl) { openPublish(pubEl.dataset.publish); return; }
  const fileEl = e.target.closest("[data-file]");
  if (fileEl) { e.preventDefault(); openInspector(fileEl.dataset.file, fileEl.dataset.line); return; }
  const lay = e.target.closest("[data-layer]");
  if (lay && lay.tagName === "BUTTON") { setLayer(lay.dataset.layer); return; }
  const tm = e.target.closest("[data-tm]");
  if (tm) { $$("[data-tm]").forEach((b) => b.setAttribute("aria-pressed", String(b === tm))); $("#treemap").dataset.mode = tm.dataset.tm; drawTreemap(current); return; }
  const rb = e.target.closest("[data-route]");
  if (rb) { const on = rb.getAttribute("aria-pressed") !== "true"; isolate(rb, on ? +rb.dataset.route : null, true); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeInspector();
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".stn")) { e.preventDefault(); openInspector(e.target.dataset.file); }
});
let pinned = new Map();
function isolate(btn, i, pin = false) {
  const ul = btn.closest(".legend"), svg = document.getElementById(ul.dataset.map);
  if (pin) { pinned.set(ul.dataset.map, i); $$("button", ul).forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.route === i))); }
  const r = i == null ? pinned.get(ul.dataset.map) : i;
  svg.classList.toggle("isolating", r != null);
  $$(".line,.stn,.lbl", svg).forEach((el) => el.classList.toggle("on", r != null && (el.dataset.r == r || el.classList.contains("r" + r))));
  if (ul.dataset.map === "map-lg" && current) {
    const box = $("#route-detail"), route = current._routes[r];
    if (box) box.innerHTML = route ? `<b style="color:var(--ink)">${esc(route.label)}</b>: ${txt(route.explanation || "")}<br><br>${route.stops.map((p, k) => { const f = current._files.get(p); return `${k + 1}. ${fileChip(current, p)}<span class="mono" style="font-size:12px">${f?.tokens != null ? tok(f.tokens) + " tok" : f ? bytes(f.bytes) : ""}</span>`; }).join("<br>")}<br><br>Reading every stop costs ~${tok(route.stops.reduce((s, p) => s + (current._files.get(p)?.role === "script" || current._files.get(p)?.role === "binary" ? 0 : current._files.get(p)?.tokens || 0), 0))} tokens (scripts run, not read).` : "Point at a route to isolate it. Select a station to open the file.";
  }
}
document.addEventListener("pointerover", (e) => { const rb = e.target.closest?.(".legend [data-route]"); if (rb) isolate(rb, +rb.dataset.route); });
document.addEventListener("pointerout", (e) => { const rb = e.target.closest?.(".legend [data-route]"); if (rb && !rb.contains(e.relatedTarget)) isolate(rb, null); });
document.addEventListener("focusin", (e) => { const rb = e.target.closest?.(".legend [data-route]"); if (rb) isolate(rb, +rb.dataset.route); });
function setLayer(l) {
  document.body.dataset.layer = l; store.set("sp-layer", l);
  $$(".layer-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.layer === l)));
  if (l === "full") requestAnimationFrame(() => current && drawTreemap(current));
}
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => current && drawTreemap(current), 150); });

// ------------------------------------------------------------ publish (local app only)
const pubDlg = $("#pub");
const postPublish = async (id, action, state) => {
  const r = await fetch(`api/publish/${encodeURIComponent(id)}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state ? { state } : {}) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || `Publish failed (${r.status})`);
  return d;
};
const pubFrame = (id, body, actions) => {
  pubDlg.innerHTML = `<div class="pub-head"><h2 id="pub-title">Publish ${esc(id)}</h2></div><div class="pub-body">${body}</div><div class="pub-actions">${actions}</div>`;
};
const pubList = (title, items, mark = "") => items.length ? `<h3 class="subhead">${title}</h3><ul class="pub-list">${items.map((x) => `<li>${mark}<span>${x}</span></li>`).join("")}</ul>` : "";
const pubCancel = `<button type="button" class="btn ghost" data-pub-close>Cancel</button>`;
async function openPublish(id) {
  pubFrame(id, `<p class="loading-line" role="status">Checking what would go public</p>`, pubCancel);
  pubDlg.showModal();
  let p;
  try { p = await postPublish(id, "preview"); } catch (e) { pubFrame(id, `<p role="alert">${esc(e.message)}</p>`, `<button type="button" class="btn" data-pub-close>Close</button>`); return; }
  const stop = [...p.validationErrors.map((e) => esc(e.replace(/^ERROR [^:]+: /, ""))), ...p.blockers.map((b) => `${esc(b.kind)}: <code>${esc(b.text)}</code> at ${esc(b.at)}`)];
  pubFrame(id, `<p class="pub-url">${esc(p.url)}</p>
    <p>${p.state === "listed" ? "This page is public and listed on the site, and this replaces the current version." : !p.state ? "This page goes online as a draft. For 24 hours only people with the link can open it, then it's listed automatically." : p.listAfter ? `This page stays a draft until ${esc(new Date(p.listAfter).toLocaleString())}, then it's listed automatically. Changed content restarts the 24 hours.` : "This page stays a draft and isn't listed until you add it."} Only the analysis is uploaded (${bytes(p.bytes)}). The skill's source files stay on this machine.</p>
    ${pubList("Must be fixed first", stop, MARK.high)}
    ${pubList("Goes public, check these", p.review.map((r) => `<code>${esc(r.text)}</code> <small>${esc(r.kind)}</small>`))}
    ${pubList("Local paths removed", p.rewrites.map((r) => `<small>${esc(r.at)}</small><br><code>${esc(r.to)}</code>`))}`,
    `${p.ok ? `<button type="button" class="btn" data-pub-go="${esc(id)}">${!p.state ? "Publish draft" : p.state === "draft" ? "Update draft" : "Update live page"}</button>` : ""}${p.ok && p.state ? `<button type="button" class="btn ghost" data-pub-go="${esc(id)}" data-pub-state="${p.state === "draft" ? "listed" : "draft"}">${p.state === "draft" ? "Add to public list" : "Move back to draft"}</button>` : ""}${p.ok && p.listAfter ? `<button type="button" class="btn ghost" data-pub-go="${esc(id)}" data-pub-state="draft">Keep as draft</button>` : ""}${pubCancel}`);
}
async function runPublish(id, state) {
  pubFrame(id, `<p class="loading-line" role="status">Publishing. This usually takes under a minute.</p>`, "");
  try {
    const d = await postPublish(id, "deploy", state);
    pub = await fetch("api/publish/status", { cache: "no-store" }).then((r) => r.json());
    if ($(".topbar") && current?.id === id) $(".topbar").outerHTML = topbar(undefined, id);
    const isDraft = d.state === "draft";
    pubFrame(id, `<p role="status">${!d.live ? "Deployed, but the address isn't answering yet. A new hostname can take a few minutes." : isDraft ? (d.updated ? "The draft is updated." : "The draft is online.") : d.updated ? "The live page is updated." : "The page is live."}</p><p class="pub-url"><a href="${esc(d.share)}" target="_blank" rel="noopener">${esc(d.share)}</a></p><p>${isDraft ? "Send this link to your reviewers. The page isn't listed anywhere yet." : "Link previews work with this address."}</p>`, `<button type="button" class="btn" data-pub-close>Done</button>`);
  } catch (e) {
    pubFrame(id, `<p role="alert">Nothing changed on the live site.</p><pre class="pub-err">${esc(e.message)}</pre>`, `<button type="button" class="btn" data-pub-close>Close</button>`);
  }
}
pubDlg.addEventListener("click", (e) => {
  if (e.target.closest("[data-pub-close]")) pubDlg.close();
  const go = e.target.closest("[data-pub-go]");
  if (go) runPublish(go.dataset.pubGo, go.dataset.pubState);
});

// ------------------------------------------------------------ router
async function route() {
  closeInspector();
  const raw = location.hash ? location.hash.replace(/^#\/?/, "") : (document.body.dataset.skill || "");
  const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) { current = null; return viewHome(); }
  if (parts[0] === "compare") return viewCompare(parts[1], parts[2]);
  return viewReader(parts[0], parts[1]);
}
document.body.dataset.layer = store.get("sp-layer", "full");
window.addEventListener("hashchange", route);
(async function boot() {
  const opt = (u) => fetch(u, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null);
  site = await opt(`${ROOT}api/site.json`);
  isPublic = !!site?.published;
  if (!isPublic) pub = await opt(`${ROOT}api/publish/status`);
  route();
})();
