# Skill design patterns

A catalog to match against. Use these ids in `patterns[].id` when one fits; name new patterns in the same style. Each entry: what it is, how to spot it, what it buys, what it costs.

## Structure

**`router-skill`** · Router SKILL.md
SKILL.md holds core rules and a table mapping intents or sub-commands to reference files; the playbooks live elsewhere.
Spot: a command or intent table with links; references outweigh SKILL.md many times over.
Buys: context cost tracks the request. Costs: one more hop; routing must be explicit or the model reads too much.

**`monolith`** · Single-file skill
Everything in SKILL.md. Fine under a few hundred lines; a smell beyond ~500.

**`subcommand-table`** · Sub-commands with `argument-hint`
`user-invocable: true` plus an `argument-hint` listing verbs, and a table that routes each verb.
Buys: discoverable slash-command UX (`/skill verb target`).

**`tiered-references`** · References by depth
References that link to further references (depth 2+), e.g. a playbook that loads a mode file.
Costs: hidden context; the load map gets deep.

## Execution

**`launcher-script`** · Context launcher
The first instruction runs a script that gathers project state and prints directives the model follows.
Spot: "Run `scripts/x context` once per session".
Buys: deterministic setup, less prose. Costs: the script becomes a second source of instructions that readers of SKILL.md cannot see.

**`deterministic-core`** · Script for the measurable, model for judgment
Scripts compute, parse, validate or package; the model interprets.
Spot: scripts with clear CLIs and JSON output; prose says "run X, then read its output".

**`schema-first-output`** · Schema-first output
The skill defines the output's JSON or file shape in a reference, often with a validator.
Buys: outputs a viewer or another tool can consume; easy to check.

**`state-on-disk`** · State machine on disk
Progress recorded in files (`state.json`, phase gates) so the run survives context loss and gates are enforced by scripts.

**`viewer`** · Generated viewer or report
A script or static app renders results as HTML for the user to review.

**`eval-loop`** · Eval loop
Test prompts, graded runs, benchmarks and iteration on the skill itself.

## Interaction

**`interview-gate`** · Interview before work
A required question round (structured tool) before producing anything, with a rule for what happens when nobody answers.

**`decision-page`** · Decision UI
A local page that shows options visually and returns the user's choice to the model.

**`explicit-negative-trigger`** · Negative trigger
The description says what the skill is not for, steering near misses elsewhere.

**`handoff-to-skill`** · Hand-off to another skill
Names another skill for adjacent jobs instead of half-doing them.

## Robustness

**`degraded-mode`** · Degraded-mode fallbacks
Instructions for when a capability is missing: no subagents, no launcher, no network, other OS.

**`shipped-subagents`** · Shipped subagents
Agent definitions inside the skill (`agents/*.md`) for fresh-context work such as review or grading.

**`fresh-context-review`** · Fresh-context review
A reviewer that does not inherit the builder's transcript, so it judges evidence rather than intentions.

**`telemetry-opt-out`** · Telemetry with opt-out
Anonymous pings with a documented environment variable to disable them. Note it under `touches` as network.

## Smells

**`imperative-wall`**: dozens of MUST/NEVER with no reasons; the model cannot weigh rules that conflict.
**`orphan-files`**: files nothing references; dead weight or a broken route.
**`hidden-instructions`**: behavior that lives only in script output, invisible from the markdown.
**`overbroad-trigger`**: a description that claims a whole domain and steals prompts from other skills.
**`blanket-preapproval`**: `allowed-tools` grants a whole interpreter or shell (`Bash`, `Bash(python3 *)`, `Bash(node *)`). Those commands then run without a prompt while the skill is active, including anything a prompt-injected file asks for. Scope each rule to the skill's own entry points, e.g. `Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/scan.py *)`. A `*` in a Bash rule matches spaces too, so a rule that starts with a wildcard is no boundary. The scanner warns on these.
