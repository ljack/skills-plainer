# Analysis schema (`skills-plainer/analysis@1`)

One JSON object per analyzed skill, stored as `<id>.json`. The web app renders exactly these fields, so missing fields become missing sections. `validate.py` enforces what is marked **required**.

Evidence objects everywhere have the same shape: `{"file": "SKILL.md", "line": 42}` or with a range, `{"file": "SKILL.md", "line": 42, "end": 58}`. `file` is a path from `inventory.files[].path`. Two other kinds exist for facts no text line holds: `{"file": "scripts/bin/x", "kind": "strings", "note": "GET https://example/api"}` for text read out of a binary with `strings` (never by running it), and `{"file": "SKILL.md", "kind": "inferred", "note": "why"}` for a conclusion drawn from the structure. The app labels both.

```jsonc
{
  "schema": "skills-plainer/analysis@1",          // required
  "id": "impeccable",                              // required, = filename
  "analyzedAt": "2026-11-07",                      // required, ISO date
  "analyzer": "skills-plainer 1.0.0 · claude-opus-5-5",
  "sourceUrl": "https://github.com/owner/repo",  // optional: the skill's public home. Set it only when the address opens without logging in
  "source": { "path": "~/.claude/skills/impeccable", "origin": "user" },  // origin: user | project | plugin:<marketplace>
  "readInFull": ["SKILL.md", "reference/new-work.md"],  // files you actually read end to end
  "readPartially": [{ "file": "reference/critique.md", "upTo": 300 }],  // files read only in part

  "inventory": { /* scan.py output, verbatim */ },  // required

  "summary": {                                      // required
    "headline": "A design director that loads one playbook at a time.",  // < 90 chars
    "oneLiner": "What it is, in one sentence.",
    "archetype": "router",                          // router|workflow|toolkit|reference|persona|orchestrator|generator
    "secondaryArchetype": "orchestrator",           // optional, same values
    "plain": ["2-3 short paragraphs for a skill user."],
    "forAuthors": ["1-3 paragraphs on the engineering."],
    "touches": [                                    // what it does to the user's machine/session
      { "kind": "read",  "what": "PRODUCT.md and DESIGN.md in your project" },
      { "kind": "exec",  "what": "a bundled launcher binary" },
      { "kind": "network", "what": "downloads the binary on first run" }
    ]                                               // kind: read|write|exec|network|spawn|ask|browser|server
  },

  "trigger": {                                      // required
    "explanation": "How the description decides when this fires.",
    "phrases": [                                    // verbatim substrings of the description, in order
      { "text": "Use when the user wants to design", "role": "when" }
    ],                                              // role: what|when|verbs|objects|domain|negative|boundary
    "fires": ["Polish the settings page"],
    "nearMiss": [{ "prompt": "Optimize this SQL query", "why": "backend-only is excluded" }],
    "invocation": { "model": true, "user": true, "argumentHint": "..." },
    "notes": ["Observations about precision, overlap with other skills, length."]
  },

  "loadTiers": [                                    // required, exactly these four ids, in order
    { "tier": "always",  "label": "Always in context", "tokens": 150, "files": ["SKILL.md"], "explanation": "..." },
    { "tier": "trigger", "label": "When it fires",     "tokens": 2774, "files": ["SKILL.md"], "explanation": "..." },
    { "tier": "demand",  "label": "When a route needs it", "tokens": 111115, "files": ["reference/polish.md"], "explanation": "..." },
    { "tier": "execute", "label": "Run, never read",   "bytes": 18354580, "files": ["scripts/impeccable"], "explanation": "..." }
  ],

  "routes": [                                       // required, 2-6; draws the load map
    {
      "id": "polish",
      "label": "Polish a screen",
      "when": "/impeccable polish settings",       // a prompt or command that takes this route
      "stops": ["SKILL.md", "scripts/impeccable", "reference/polish.md", "reference/craft-floor.md"],
      "via": { "reference/mode-persuade.md": "named in concept-seed's output, not linked in markdown" },  // optional: how a stop is reached when no link leads there
      "explanation": "One sentence on what happens along the way."
    }
  ],

  "commands": [                                     // [] when the skill has none
    { "name": "polish", "group": "Refine", "does": "...", "loads": ["reference/polish.md"], "example": "/impeccable polish the checkout" }
  ],

  "toolbox": [                                      // optional; the tools a skill drives, when they are its core
    { "name": "search", "group": "Local", "need": "Find evidence", "decision": "Narrow the path or glob first", "evidence": [{ "file": "SKILL.md", "line": 33 }] }
  ],

  "lifecycle": [                                    // required, 4-12 steps of one typical request
    { "n": 1, "kind": "exec", "title": "Load project context", "what": "...", "files": ["scripts/impeccable"], "evidence": [{ "file": "SKILL.md", "line": 21 }] }
  ],                                                // kind: read|exec|decide|ask|write|spawn|verify

  "components": [                                   // notable files; the rest fall back to the inventory
    { "path": "reference/new-work.md", "role": "playbook", "explains": "..." }
  ],

  "scripts": [
    { "path": "scripts/impeccable", "does": "...", "invokedAs": "scripts/impeccable context", "touches": ["network: first-run download"], "safety": "..." }
  ],

  "patterns": [
    { "id": "router-skill", "name": "Router SKILL.md", "what": "...", "where": [{ "file": "SKILL.md", "line": 72 }], "steal": "How another author reuses it." }
  ],

  "guardrails": [
    { "rule": "Never repair drift as a side effect", "quote": "verbatim, under 200 chars", "evidence": { "file": "SKILL.md", "line": 107 } }
  ],

  "risks": [
    { "level": "medium", "title": "...", "detail": "...", "evidence": { "file": "scripts/impeccable", "line": 138 } }
  ],                                                // level: high|medium|low|info

  "scorecard": [                                    // required, one row per rubric criterion id
    { "id": "trigger-precision", "score": 4, "note": "...", "evidence": [{ "file": "SKILL.md", "line": 3 }], "fix": "only when score < 4" }
  ],

  "glossary": [{ "term": "surface brief", "meaning": "..." }],

  "verdict": {
    "strengths": ["..."],
    "weaknesses": ["..."],
    "bestFor": "Who should install it and when.",
    "lessons": ["Short, reusable lessons for skill authors."]
  }
}
```

## Field rules

- `trigger.phrases[].text` must appear verbatim in `inventory.frontmatter.description`. Cover the whole description in order where you can; the app highlights each phrase in place.
- `routes[].stops` are real paths from `inventory.files`, in the order the model meets them. `SKILL.md` is first.
- `loadTiers[].tokens` for `always`, `trigger`, `demand` come from `inventory.budget`; `execute` uses `bytes`.
- `scorecard[].id` must be the rubric's ids, all of them, each scored 0-5.
- `guardrails[].quote` must appear verbatim within three lines of its evidence line; the validator checks this when the skill is on disk (whitespace and Markdown emphasis are ignored).
- Strings are plain text. Inline code in backticks renders as code. No HTML, no Markdown beyond backticks.
