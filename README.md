# skills-plainer

An agent skill that takes other skills apart and explains them, plus a web app that draws the result as a transit map.

**Live showcase:** [skills.jarkkolietolahti.com](https://skills.jarkkolietolahti.com/) · Built by [Jarkko Lietolahti](https://jarkkolietolahti.com)

Point it at any skill folder (anything with a `SKILL.md`). It reads the folder and never runs it. It writes a structured analysis covering what the skill does, when it fires, what enters the context window and when, what it runs on your machine, which design patterns make it work, and where it is weak. Every claim is cited to `file:line`.

```
skills-plainer/            the skill (installable folder)
├── SKILL.md               frontmatter, ground rules, command routing
├── references/
│   ├── method.md          how to read a skill: scan → read → interpret → write → validate → show
│   ├── schema.md          analysis@1 JSON schema the app renders
│   ├── rubric.md          nine-criterion scorecard with anchors
│   ├── patterns.md        catalog of skill design patterns and smells
│   └── trace.md           walk one prompt through a skill
├── scripts/
│   ├── locate.py          find skills by name/path; --all --status lists everything installed
│   ├── scan.py            deterministic inventory: frontmatter, files, tokens, links, commands, capabilities, risks
│   ├── validate.py        schema + evidence checks (files exist, lines in range, quotes verbatim)
│   └── serve.py           localhost server for the app, with a read-only source endpoint
└── app/                   static web app, no build step, fonts self-hosted
    └── analyses/          showcase: impeccable, skill-creator
```

## Install

```sh
git clone https://github.com/ljack/skills-plainer.git
ln -s "$PWD/skills-plainer/skills-plainer" ~/.claude/skills/skills-plainer
```

While the skill is active, Claude Code runs its four scripts (`locate`, `scan`, `validate`, `serve`) without asking, and only when they're called by the skill's own path. Every other command, including scripts inside a skill being analyzed, still asks first. Writing the analysis file asks too.

## Use (Claude Code)

| Command | What you get |
|---|---|
| `/skills-plainer analyze <skill>` | Full analysis, validated, opened in the web app |
| `/skills-plainer explain <skill> [question]` | Quick answer in chat |
| `/skills-plainer trace <skill> "<prompt>"` | What would happen for that prompt: trigger, route, loads, runs, asks |
| `/skills-plainer compare <a> <b>` | Side-by-side view |
| `/skills-plainer score <skill>` | Scorecard with fixes |
| `/skills-plainer open [skill]` / `list` | Open the app / list installed skills and analysis status |

New analyses go to `~/.skills-plainer/analyses/`.

## Web app only

```sh
python3 skills-plainer/scripts/serve.py --open impeccable
```

It opens `http://127.0.0.1:7341/`. Sections: In plain words, When it fires, Load map, Commands, One request, Anatomy, Scripts, Patterns to borrow, Guardrails, Risks, Scorecard, Glossary, Verdict. Point at a route on the load map to isolate it. Select any station or `file:line` chip to open the file with the cited line highlighted.

Choose **Drafts** in the navigation to list draft skills and their publication ETAs, soonest first. Dates include your time zone; drafts without a timer say **Not scheduled**. The public list exposes names, groups and publication times, but not draft share links or analysis content. Use **Refresh** to reload the schedule; relative ETAs update every minute. Publication checks run hourly.

File-and-line references, such as `SKILL.md:16-24`, link to the exact analyzed source revision when the analysis records a public GitHub repository, full commit SHA and verified `sourcePath`. The same applies to evidence and file chips. Unknown source locations retain the local inspector behavior; repository-root paths are never guessed. Automatically fetched skills record their repository subdirectory for future analyses.
