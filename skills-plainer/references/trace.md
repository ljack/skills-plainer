# Trace: one prompt through a skill

`trace <skill> "<prompt>"` answers "what would happen if I typed this?" without running anything. Answer in chat, as a numbered walk.

1. **Scan** the skill (method step 1) if no current analysis exists; otherwise load the stored one.
2. **Trigger.** Would the description fire on this prompt? Quote the phrases that match and any boundary that excludes it. If it is a slash command (`/name ...`), it fires by invocation; say whether `disable-model-invocation` would have stopped automatic triggering. Name competing installed skills that could claim it (`locate.py --all` gives their descriptions) when the overlap is real.
3. **Route.** Which branch of SKILL.md's routing takes it, with the line. Which command, mode or default path.
4. **Loads.** Every file the model would read, in order, with token estimates from the inventory, and the running total. Mark files loaded only conditionally.
5. **Runs.** Every script or binary it would execute, the exact command, and what each touches (from `scripts[].capabilities`).
6. **Asks.** Every point where the user is asked something, and what happens if nobody answers.
7. **Produces.** Files written, pages opened, messages shown.
8. **Watch-outs.** Anything surprising: network on first run, long loads, gates that block until answered.

End with one line: total estimated tokens loaded and the number of user decisions. Offer `analyze` for the full page.
