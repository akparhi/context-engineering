---
name: principle-use-resources-efficiently
description: "Apply before a build, test suite, or fan-out, between iterations of a dev loop, and on a LOW warning. Check the machine's free memory and disk, back off when low, and clean up what you started."
user-invocable: false
---
# Use Resources Efficiently

Agents run on the user's own machine. A run that takes 100 GB of memory or fills the disk slows or stops everything else they run.

`scripts/resources.sh check` prints free disk and memory, and a LOW line for each resource under its floor: disk under 20 GB or 10% free, memory under 15% available. When either is low, it also lists the five largest processes and exits 1. Hooks run the same script. Session start prints the figures, and each prompt and subagent start prints the LOW lines.

- Run the check before a build, test suite, or fan-out, and between iterations of any loop that launches work. Cap test workers, build jobs, and parallel subagents to what is free.
- When it exits 1, back off. Launch nothing new, let running work finish or kill what you started and no longer need, then check again. Resume at a lower width once it exits 0. Report in the reply any back-off that lasted more than one round.
- Kill a process you started that grows past a quarter of total memory or hangs.
- Stop each background task and process you started once it finishes or you no longer need it: dev servers, watchers, background shells, stalled subagents.
- Never write output that would fill the disk.
- Remove a worktree once its PR is open and the CI watch has finished. The branch lives on the remote, so a later fix starts from a fresh worktree. Keep one only while it holds uncommitted or unpushed work.
- Before you finish, delete what you made and no longer need: other worktrees (hotline's Worktree and simulator cleanup playbook), build output, caches, and large scratch in `.tmp/`. Compare free disk with the session-start figure and explain any large drop.
