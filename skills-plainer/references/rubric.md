# Scorecard rubric

Nine criteria, each scored 0-5 against the anchors. Score what the files show, cite it, and when a score is under 4 write the single most valuable `fix`. Anchors describe 1, 3 and 5; 0 means absent or harmful, 2 and 4 sit between.

| id | Criterion | Asks |
|---|---|---|
| `trigger-precision` | Trigger precision | Will it fire on the right prompts and stay quiet on the wrong ones? |
| `progressive-disclosure` | Progressive disclosure | Does context cost scale with the request? |
| `routing-clarity` | Routing clarity | How fast does the model know which path to take? |
| `instruction-quality` | Instruction quality | Are instructions specific, reasoned and consistent? |
| `determinism` | Determinism | Is fragile or repeatable work done by scripts rather than prose? |
| `safety` | Safety | Are side effects disclosed, bounded and gated? |
| `user-control` | User control | Does it ask at the right moments and not otherwise? |
| `maintainability` | Maintainability | Can an author change it without breaking it? |
| `portability` | Portability | Does it work across harnesses, OSes and setups? |

## Anchors

**trigger-precision**
1: vague noun phrase ("helps with documents"); no when, no when-not.
3: says what and when; misses obvious near misses or overlaps another common skill.
5: what + when + explicit boundary ("Not for ..."), concrete trigger vocabulary users actually say, under ~1024 chars.

**progressive-disclosure**
1: everything in SKILL.md, or SKILL.md over ~500 lines with rarely needed detail inline.
3: references exist but SKILL.md still carries material only some routes need.
5: SKILL.md is the router and core rules; each route loads only its own files; links say when to load them.

**routing-clarity**
1: the model must read everything to decide what to do.
3: a workflow exists but branches are implicit or scattered.
5: an explicit table or decision list maps intents to actions and files, including the no-argument and ambiguous cases.

**instruction-quality**
1: bare commands, contradictions, or walls of MUST with no reasons.
3: mostly clear; some vague verbs ("handle", "make good") or unexplained absolutes.
5: explains why, gives concrete examples and counterexamples, defines its terms, and keeps absolutes for real bans.

**determinism**
1: asks the model to hand-compute, parse or repeat work a script would do reliably.
3: scripts exist for some fragile steps; others are left to prose.
5: every fragile, repeatable or measurable step has a script with a stated invocation and output; prose handles judgment only.

**safety**
1: destructive or network actions without disclosure or gate; secrets handled loosely.
3: side effects mentioned but not gated; network use disclosed only in code; `allowed-tools` pre-approves a whole interpreter or shell.
5: read-only by default; writes, deletes, network and spending are named, scoped and confirmed; untrusted content treated as data; any `allowed-tools` pre-approval names the skill's own entry points only.

**user-control**
1: never asks, or asks constantly about trivia.
3: asks, but at the wrong granularity or without a fallback when nobody answers.
5: asks only decisions that are the user's, batches them, uses structured questions, and states what happens unattended.

**maintainability**
1: tangled cross-references, orphaned files, no version, duplicated rules.
3: organized, some drift (orphans, duplicated guidance, stale names).
5: clear layout, versioned, single source per rule, no orphans, schemas or metadata for generated parts.

**portability**
1: hard-coded paths, one OS, undeclared dependencies.
3: works on the main setup; others need manual steps.
5: resolves its own base path, declares dependencies, ships fallbacks (other OS, no subagents, no network), degrades gracefully.
