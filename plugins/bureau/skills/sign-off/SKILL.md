---
name: sign-off
description: "Present a finished plan to a person for approval as one self-contained page in four acts (product, tech, verification, pull requests), and record their verdicts in an append-only log that decides which steps may start. Use when a plan is ready for sign-off, review or approval by a person, when asked to show a plan before building it, and when a verdict arrives: a message that contains `sign-off:v1:`, \"approved\", \"approve all\", \"send back the API\", \"the lead signed off\", or \"the review is in\"."
---

# Sign-off

The page asks a person, the reader, to approve a plan item by item. The log of their answers says which steps may start. The page shows one sub-step at a time, in six steps: Product, Tech, Verification, PR plan, Gates and Decide. A side menu and Back and Next buttons move between them. Pressing an id opens a side drawer that lists what the id links to, under the pull request's card, the test's detail or the requirement's text. Run every command by path:

```sh
bun ${CLAUDE_SKILL_DIR}/scripts/sign-off <command> <plan-dir> ...
```

The first run installs the pinned dependencies with bun. Run a command with no arguments to print every usage line. Exit 2 is a usage error, and exit 1 is a refusal with its reason.

- `sign-off check --selftest` proves this copy of the skill works. It builds the fixture, ingests a generated review, reads `status`, and loads the page in headless Chromium, where no diagram text may render under 12 px. Then it renders the fixture's statechart alone with `render --part` and loads that the same way. It skips both browser steps when no Chromium is found.
- `sign-off stop <plan-dir>` stops that plan's server and prints what it stopped. `sign-off stop --all` stops every sign-off server on `127.0.0.1` ports 41700 to 42699, one line each. Neither touches a process that does not answer `/health` as a sign-off server, and a plan with no server prints that and exits 0. Run `stop` on a plan folder when its review is done, so servers do not pile up.

## The voice

The page is always the agent asking the reader. Write the `ask`, the `note`, each `why` and each question as the agent, with the reader as "you": "Approve the plan for holds, and answer the question that blocks the endpoints." The page has no author view, and nothing on it or in `status` depends on who reads it. The reader's name labels the review and nothing else.

## The loop

1. **Author.** Write `sign-off.json` in the plan folder, beside `plan.md`, by [references/manifest.md](references/manifest.md). The schema is [scripts/manifest.ts](scripts/manifest.ts), and [fixtures/plan/](fixtures/plan/) is a complete worked example. Fill `ticket` and `sources` from the ticket and its attachments. Never invent a URL.
2. **Check.** Run `sign-off check <plan-dir>` until it reports 0 errors. Every error names its rule, and the manifest reference gives the fix for each. Warnings are trace holes. Fix them or say why they stay.
3. **Open.** Run `sign-off open <plan-dir>` as a background command. It builds `sign-off.html` when the page is missing or older than its inputs, starts one server for the plan on `127.0.0.1` or reuses the live one, prints the URL, and waits 25 minutes for a review. `--wait <minutes>` sets the wait, and `--wait 0` prints the URL and returns. `sign-off build <plan-dir>` writes the page alone, for a file to share. `sign-off render <plan-dir> --part <view>` writes one view, such as `statechart` or `erd`, as its own page in `parts/<view>.html`, or in `--out <file>`, and prints the path. The part page uses no viewport height unit, so it can sit inside another page's frame. A view the plan has no block for exits 1 and lists the views it has.
4. **Show.** Open the URL in the reader's default browser, such as Chrome. Use `open <url>` on macOS or `xdg-open <url>` on Linux. Also give the reader the URL in your reply. The reader gives the verdicts. You may load the page to check that it works, but never approve on the reader's behalf.
5. **Wait.** When the reader submits, the page posts the review to the server, and the Submit dialog lists the items recorded and the items that were stale. When the post fails, the dialog shows the review text with Copy, and the reader pastes it to you. `open` prints "Review received", ingests the review and exits, which wakes you. When the wait ends with no review, end your turn. The server stays up until the plan settles or sits idle for 2 hours, so a review that comes back within 2 hours still lands in the log. After that, `open` starts it again on the same port, and the reader keeps the draft.
6. **Read.** Run `sign-off status <plan-dir>`. It lists each act, each item's state, and each step with "may run" or the unsettled items it waits on (an FYI item counts as settled). `--json` gives the same as data. Start every step that may run, and only those.

`open` on a settled plan starts no server and says so. `status` and `open` refuse a plan that fails `check`.

## Verdicts given in chat

Record them with `record`. Pass `--by "<name>"` with the reader's name.

- `sign-off record <plan-dir> <item> approve|changes [--note <text>]` records one verdict. Put the reader's reason for `changes` in `--note`.
- `sign-off record <plan-dir> <question> --answer <option id, option label or text>` answers a question. A question takes no verdict, and an item that is not a question takes no answer.
- `sign-off record <plan-dir> --all` approves every open or reopened item that needs approval, except the grant. It prints the grant's lines and leaves it open, because the grant lets you act without asking. Approve the grant only when the reader approves it in words: `record <plan-dir> --all --grant`, or `record <plan-dir> <grant id> approve`.

An FYI item has nothing to approve, so `record <item> approve` refuses it. `changes` on an FYI item records an objection. One reader's `changes` holds an item until that reader approves it or you revise it, whoever else approved it. `record` prints the command that clears it.

## A pasted review

A message that contains `sign-off:v1:` is a review from the page's Copy button. Ingest it:

```sh
sign-off ingest <plan-dir> --text "<the whole message>"
sign-off ingest <plan-dir> <review-file>
```

With neither, `ingest` reads stdin. It checks the checksum and the plan id, then appends the events. Ingesting the same review twice appends nothing. Each ingest that appends events rebuilds the page and writes `reviews/<planRev>.html`, whether the review came from a file, stdin or the page's post. The copy records what the reader saw and decided. `ingest` records a verdict on an older revision of an item as stale, and it settles nothing. When the checksum fails, ask for the downloaded review file, or for the whole message copied again with its fence.

## When the reader asks for changes

1. Run `status`. Each item in `changes` shows the reader's note.
2. Revise that item in `sign-off.json`, or in the file it draws from, and nothing else. Run `check`.
3. Run `sign-off revise <plan-dir> <item> --note "<what changed>"` for each revised item. The note tells the reader what changed. `revise` reads the item's old `itemRev` from the log and its new one from the files, so never write a `revise` line by hand. It refuses an item that no review covered, and an item whose `itemRev` is the same as in its latest event.
4. Run `open` again.

Revisions are per item. An item whose `itemRev` is unchanged keeps its verdict. A changed item reopens. `status` marks it `reopened`, and shows the reader's old verdict beside your revise note. An edit to a `plan.md` heading reopens the item that cites it. Reflowed lines, blank lines and comments in a source file reopen nothing.

## Theme

`build` reads `theme` from the nearest `.claude/sign-off.config.json` at or above the plan folder. The theme file holds only `--name: value` CSS variable declarations, and `build` refuses anything else.
