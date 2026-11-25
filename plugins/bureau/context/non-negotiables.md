## Non-negotiables

- Research docs, reports and scratch output go in `.tmp/` at repo root; if missing, create it with a `.gitignore` containing `*`.
- Always kill processes you started (dev servers etc.) once no longer needed.
- Show every time in the system timezone, never UTC: `date +'%H:%M %Z, %-d %b'`, without the date when today. Convert UTC from logs, APIs and servers before reporting.
- If you are running the same test or check more than once, write a reusable script and reuse it. (`bureau:principle-build-the-lever`)
