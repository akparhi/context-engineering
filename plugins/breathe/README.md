# breathe

Keeps a Mac usable while Claude Code agents run. macOS only.

```
/plugin install breathe --marketplace akparhi/context-engineering
```

After each tool call, prompt and subagent start, a hook reads free memory and free disk. When free memory drops under `breathe_memory_floor_pct` (15) or free disk under `breathe_disk_floor_gib` (15 GiB), it tells the agent to stop what it no longer needs and to hold off heavy work and new subagents. The note lists the session's own five largest commands and each other session's total, so a session knows whether it is the cause. It also says when most of the pressure comes from outside the agents. The warning repeats at most once a minute per agent, and stays until free memory is back to `breathe_recover_pct` (30) and disk is over its floor. Then one line tells each warned agent that normal work can resume.

A plugin monitor checks the same numbers every 10 seconds and wakes an idle session once each time the Mac goes low, so the note arrives even when no agent is working. It costs about 3 ms of CPU every 10 seconds and 3.5 MiB of memory per session. The monitor reads the options from your user `settings.json`, because Claude Code does not pass plugin options to monitors.

Every session shares one state in `~/.local/state/breathe/`. Change the numbers or turn `breathe` off in `/config`. Nothing is killed: the agents decide what to stop.

Tests: `npm run test:breathe` from the repo root.
