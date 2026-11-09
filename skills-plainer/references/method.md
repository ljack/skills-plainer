# Analysis method

How to read a skill well enough to explain it. Steps 1-4 serve `explain`; all eight serve `analyze`.

## 1. Locate and scan

`python3 <base>/scripts/locate.py <skill>` → directory. `<base>` is the skill directory exactly as SKILL.md spells it in its commands (`${CLAUDE_SKILL_DIR}`, already expanded there). Use that same absolute path every time: only commands of that exact form are pre-approved. Then:

```
python3 <base>/scripts/scan.py <dir> --out ~/.skills-plainer/inventory/<id>.json --pretty
```

`<id>` is the frontmatter `name` (or the folder name), lowercase-hyphenated. For a plugin skill whose name collides with a user skill, suffix the plugin: `skill-creator--anthropic`.

Read the inventory before reading any prose. It tells you the shape before you form opinions:

- `budget`: what is always loaded (name + description), what loads on trigger (SKILL.md body), what waits on demand (references, agents), what is executed rather than read.
- `files[].role` and `roles`: where the weight sits. A skill whose references outweigh SKILL.md 30:1 is a router; one with everything in SKILL.md is a monolith.
- `references`: the file graph. `depth` is hops from SKILL.md; `orphans` are files nothing points at.
- `commands`: sub-commands found in a SKILL.md table or the `argument-hint`.
- `scripts[].capabilities`: network, subprocess, filesystem writes and deletes, env secrets, LLM calls, servers, browsers, each with line numbers.
- `externalLoads`: HTML or CSS assets that pull from remote hosts (fonts, CDNs). Network use the scripts list cannot show.
- `externalTools`: programs the instructions call from outside the skill folder, checked with stat only. Reviewing the folder does not review them, so say so under `risks`. The scan finds path-based calls; a tool called by bare name from PATH (`gh`, `wrangler`) goes in `toolbox` by hand.
- `hardcodedPaths`: machine-specific absolute paths with counts and locations. Evidence for the `portability` and `maintainability` scores.
- `risks` and `warnings`: pattern hits to confirm or dismiss by reading the lines. Capability hits are regex matches, so read the cited lines before repeating one as a fact.

## 2. Read SKILL.md in full

Always the whole file, with line numbers. While reading, note:

- **The routing logic.** How does the model decide what to do next? A command table, a decision list, a numbered workflow, a persona with no routing?
- **The first action.** What does the skill make the model do before anything else (run a launcher, ask a question, read a file)?
- **Gates.** Where it stops for the user, refuses, or requires a condition before continuing.
- **Hand-offs.** Subagents it spawns, other skills it defers to, tools it requires.
- **Its voice.** Explains why, or only commands? Count of MUST/NEVER is in `imperatives`.

## 3. Read what SKILL.md routes to

Budget by `budget.onDemand`:

- **Under ~25k tokens:** read every reference and agent file.
- **25k-80k:** read every file SKILL.md links directly (depth 1) that is on the main route (setup, the default path, the most common commands), plus the headings (`files[].headings`) of the rest.
- **Over 80k:** read the setup/routing files and two or three representative command files in full; the rest by headings. Say in `summary.forAuthors` which files you read in full.

Never invent the content of a file you only saw by headings. Describe it as "by its headings, ...". Record files read only in part under `readPartially`.

Agents, hooks or commands a skill installs outside its own folder (for example `~/.claude/agents/<skill>-*.md`) are invisible to the scanner. When SKILL.md names one, look for it, read it if present, and mention it under `components` notes or `forAuthors`.

## 4. Read script headers, never run them

For each `scripts[]` entry read the first ~60 lines and the lines the scanner flagged under `capabilities` and `risks`. For a binary, read the launcher that invokes it; `strings <binary> | grep -E "https?://|_KEY|TOKEN"` is allowed (it reads, it does not execute) and its findings use evidence kind `strings`. Answer: what it does, how SKILL.md invokes it (exact command), what it reads and writes, whether it touches the network and why. Large vendored bundles (minified JS, data files) are described by purpose, not read. When the skill's core is a set of tools rather than sub-commands, describe them in `toolbox`: one row per tool, and read a tool's launcher or first lines only if you need them, never run it.

`explain` stops here and answers in chat: headline, plain paragraph, when it fires, what it touches, and the answer to the user's question, with `file:line` citations.

## 5. Interpret

Decide, with evidence:

- **Archetype** (pick the dominant one; name a second in `secondaryArchetype` when the skill is genuinely both): `router` (thin SKILL.md dispatching to references), `workflow` (an ordered procedure), `toolkit` (wraps scripts the model calls), `reference` (knowledge to consult), `persona` (sets a stance and taste), `orchestrator` (coordinates subagents or other skills), `generator` (produces a specific artifact type).
- **Load tiers and routes.** Tiers are fixed (always, trigger, demand, execute). Routes are the 2-6 paths a real request takes through the files: the default path plus the most important commands. Each route is an ordered list of real paths from the inventory. These draw the load map, so they must be true. A route that never leaves SKILL.md is valid and draws as a short stub.
- **Lifecycle.** One typical request, start to finish, as 4-12 steps, each with a `kind` (read, exec, decide, ask, write, spawn, verify) and evidence.
- **Patterns.** Match against [patterns.md](patterns.md). Name the pattern, cite where it lives, say what it buys and how another author would reuse it. New patterns are welcome; give them a clear name.
- **Guardrails.** The rules that bind the model's behavior, quoted verbatim, short.
- **Risks.** Confirm or dismiss each scanner risk by reading its line. Add risks the scanner cannot see: overbroad triggers, missing negative trigger, silent network use, destructive steps without a gate, instructions that conflict, unbounded loops, heavy always-loaded text.
- **Scorecard.** Score each criterion in [rubric.md](rubric.md) against its anchors. A score without evidence is not a score.

## 6. Write

Write `~/.skills-plainer/analyses/<id>.json` per [schema.md](schema.md), with the inventory embedded verbatim under `inventory`. Writing guidance:

- **Headline:** what the skill is, as a mechanism, in under 90 characters. "A design director that loads one playbook at a time", not "A powerful design skill".
- **Plain layer:** no jargon a non-author would trip on. Say "the instructions file" before "SKILL.md" the first time.
- **Internals layer:** precise. File names, line numbers, token counts.
- **Trigger examples:** 5-8 realistic prompts that fire it, 3-6 near misses that should not, each near miss with a reason.

## 7. Validate

`python3 <base>/scripts/validate.py ~/.skills-plainer/analyses/<id>.json` checks the shape, that every `evidence` file exists in the inventory and every line is in range, that route stops are real paths, and that trigger phrases are verbatim substrings of the description. Fix every error. Re-run until clean.

## 8. Show

`python3 <base>/scripts/serve.py --open <id>` starts the app (default port 7341, the next free one when that is taken) and opens `#/<id>`. Report the URL and a five-line summary. For `compare`, open `#/compare/<a>/<b>`.

## Freshness

An analysis is current when `inventory.files[].sha1` matches a fresh scan. `compare` and `open` may reuse current analyses; a stale one is re-analyzed or shown with its date, and the user is told which.
