# Context-Mode Plugin: Token Economics Analysis

**Date:** 2026-09-25  
**Corpus:** 528 JSONL transcripts across all `~/.claude/projects/` (118 main sessions, 410 subagent sessions)  
**Plugin version:** 1.0.169

---

## Verdict: **DROP (or TRIM to subagents-only)**

The plugin costs ~6.4M tokens in fixed overhead across the analyzed corpus but has only delivered ~2.5M tokens in tracked savings. Net: **–4.0M tokens**. The primary culprit is the MCP tool schema overhead (11,300 tokens × every session), which is paid on every session regardless of whether ctx_* tools are used (only 34% of sessions actually use them). The savings model breaks even only in data-heavy sessions doing large batch analysis.

---

## Key Numbers

| Metric | Value |
|--------|-------|
| Sessions analyzed | 528 total (118 main, 410 subagents) |
| Sessions using ctx_* tools | 181 / 528 (34%) |
| Total ctx_* calls | 1,393 |
| **MCP schema overhead** | 11,300 tokens × 528 sessions = **6.0M tokens** |
| **CWP block overhead** | ~1,154 tokens × 410 injections = **0.5M tokens** |
| **Total fixed overhead** | **6.4M tokens** |
| Bytes returned to context by ctx_* | 12.9MB → **3.2M tokens** |
| Plugin-reported lifetime tokens saved | **2.5M tokens** ($12.40) |
| ctx_execute sandbox bytes (never entered context) | 1.64GB |
| Bytes indexed/kept out (ctx_fetch, ctx_batch) | 1.69GB |
| **Net (savings − overhead)** | **–4.0M tokens** |
| Missed savings (>5KB non-ctx outputs in context) | 1,995 outputs, 25.9MB, **6.5M tokens** |

---

## 1. Fixed Cost

### MCP Tool Schemas
- 11 context-mode tools contribute **11,300 tokens per session** to the context window (from `/context` readout).
- Paid on every session with the plugin active, whether or not ctx_* tools are called.
- Total across 528 sessions: **6.0M tokens overhead**.

### `<context_window_protection>` System Prompt Block
- Injected by the plugin's SessionStart hook into every subagent session.
- Measured avg size: **4,615 bytes / 1,154 tokens per injection**.
- 410 injections found across corpus → **0.47M tokens overhead**.
- Only 1 `<context_guidance>` PreToolUse injection was found in the transcripts (hook fires rarely).

---

## 2. Usage

- **34%** of sessions call any ctx_* tool (181/528 by transcript count; 25% by stats files).
- Top tools by bytes returned to context:
  - `ctx_batch_execute`: 381 calls, 8.1MB returned (2.0M tokens)
  - `ctx_execute`: 738 calls, 2.6MB returned (0.65M tokens)
  - `ctx_search`: 154 calls, 1.9MB returned (0.47M tokens)
  - `ctx_fetch_and_index`: 89 calls, 0.24MB returned (59K tokens)
  - `ctx_execute_file`: 26 calls, 0.12MB returned (31K tokens)

---

## 3. Savings Analysis

### Plugin's Own Tracker
- The plugin reports **2.5M lifetime tokens saved** ($12.40 at $5/M input token rate).
- One anomalous session reported 1.5GB "sandboxed" and 374M tokens saved — this inflates the per-session sum to 415M, but the cumulative lifetime counter (2.5M) is the credible figure.

### `ctx_execute` / `ctx_batch_execute` Savings Model
- These tools process data in a sandbox and return only the summary. The key benefit is selectivity: a command that would produce 50KB gets summarized to 2KB.
- However, the savings depend on usage pattern: if the tool returns nearly the same bytes that Bash would have returned, there's no win over native Bash.
- `ctx_batch_execute` returned 8MB across 381 calls — average 21KB/call. Comparable Bash calls in the corpus avg ~13KB (estimated from missed-savings distribution). Overhead from extra API round-trips partially offsets.

### `ctx_fetch_and_index` + `ctx_search`
- 89 fetch calls indexed large web pages but returned only 0.24MB. If those pages were fetched via WebFetch directly, they'd contribute ~2–5MB to context. **Estimated 0.5–2M tokens saved here.**

---

## 4. Net Overhead vs Savings Per Session

### Sessions WITH ctx_* usage (181 sessions)
- Fixed overhead: ~11,300 (schema) + ~1,154 (CWP if subagent) = 12,454–12,454 tokens
- Average savings from ctx_* calls: 2.5M / 181 = ~13,800 tokens/session
- **Net per active session: ≈ +1,350 tokens saved** (marginally positive)

### Sessions WITHOUT ctx_* usage (347 sessions)
- Fixed overhead: 11,300 tokens with zero savings
- **Net per inactive session: –11,300 tokens** (pure waste)

### Subagents vs Main Sessions
- Subagents (410): all get CWP injection (1,154 tokens overhead), 181/410 use ctx_*
- Main sessions (118): schema overhead only, low ctx_* adoption

---

## 5. Missed Savings

**1,995 tool results >5KB entered context without going through ctx_* tools.**
Total: 25.9MB → **6.5M tokens** that could have been processed in a sandbox.

Top projects by missed savings:
- `insomnia`: 714 large outputs, 8.7MB missed
- `athena-web`: 408 large outputs, 5.6MB missed
- `context-engineering`: 358 large outputs, 5.1MB missed
- `switchboard`: 385 large outputs, 4.4MB missed

This is the largest single opportunity: routing Bash/Read outputs through ctx_execute when the raw output exceeds 5KB would recover far more than the plugin currently delivers.

---

## Per-Project Summary

| Project | Main | Sub | ctx calls | Missed KB |
|---------|------|-----|-----------|-----------|
| insomnia | 2 | 145 | 316 | 8,685 |
| athena-web | 14 | 79 | 266 | 5,615 |
| context-engineering | 37 | 72 | 238 | 5,144 |
| switchboard | 13 | 46 | 219 | 4,436 |
| team-productivity | 2 | 55 | 57 | 491 |
| t3code | 1 | 6 | 38 | 599 |

---

## Recommendations

1. **Drop the plugin from non-technical / infrequent-use sessions.** The 11,300-token schema cost per session is never recovered when ctx_* tools aren't used (66% of sessions).

2. **If keeping, restrict to subagent contexts.** The CWP injection is already scoped there. Consider configuring the plugin to load schemas on-demand rather than upfront.

3. **The real savings opportunity is missed**: 1,995 large-output tool calls (6.5M tokens) bypassed ctx_* entirely. Enforcing ctx_execute for >5KB Bash/Read outputs would dwarf current gains.

4. **ctx_fetch_and_index is the clear winner** — 89 calls kept potentially 2–5MB of web content out of context while returning only 240KB. High ROI per call.

5. **ctx_batch_execute is the workhorse** but returns large outputs (avg 21KB). The benefit is parallelism + auto-indexing, not context reduction.

---

## Scripts Used

All analysis run in `ctx_execute` Python sandboxes (never read raw transcripts into context). Key sources:
- `~/.claude/context-mode/sessions/stats-pid-*.json` — plugin's own telemetry (300 files, 300 session records)
- `~/.claude/projects/**/*.jsonl` — transcript corpus (528 files)
- Plugin schema token count: from user-reported `/context` output (11.3K tokens for 11 tools)
