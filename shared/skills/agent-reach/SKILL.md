---
name: agent-reach
description: Use when fetching or searching content on Reddit, YouTube, or GitHub from an agent/CLI — posts, comments, transcripts, repos, user activity. Covers anti-bot workarounds, auth tiers, and rate limits per platform.
---

# Agent Reach

Read access to three platforms that fight scrapers differently. Each has a preferred path, an escalation ladder, and failure modes that look like success.

## Escalation Ladder

Stop at the first tier that answers the question.

| Tier | Cost | Use when |
|---|---|---|
| 0 — anonymous HTTP | free, instant | Default. Try first, always. |
| 1 — official CLI / API key | free, setup once | Tier 0 blocked, or need scores/pagination/write. |
| 2 — authenticated session (cookies) | fragile, manual | Only path left. Cookies expire. |
| 3 — agent-browser | slow, heavy | Deep trees, infinite scroll, anything JS-rendered. |

**Tier 0 works for all three.** Reddit needs a browser UA and a hard rate limit budget; GitHub and YouTube are unrestricted.

## Platform Summary

| Platform | Best path | Tier | Auth | Write |
|---|---|---|---|---|
| GitHub | `gh` CLI | 1 | token (optional for public) | yes |
| YouTube | `yt-dlp` | 0 | none (key for transcription) | no |
| Reddit | curl + `.rss` | 0 | none | no |

---

## GitHub

Easiest of the three. Use `gh` CLI — it handles auth, pagination, and JSON.

```bash
gh repo view owner/repo
gh issue list -R owner/repo --state open --json number,title,author --limit 20
gh search repos "topic:mcp language:python" --limit 10 --json fullName,description,stargazersCount
gh api repos/owner/repo/commits --paginate --jq '.[].commit.message'
```

- `--json <fields>` for structured output; `--jq` filters inline without a second process.
- `gh api` reaches any REST endpoint `gh` lacks a command for.
- Unauthenticated: 60 req/hr. Authenticated: 5000 req/hr. Auth via `GH_TOKEN` env var or `gh auth login`.

No-CLI fallback (public repos only, 60 req/hr):

```bash
curl -s https://api.github.com/repos/owner/repo | jq '{stars: .stargazers_count, desc: .description}'
curl -s "https://raw.githubusercontent.com/owner/repo/main/README.md"
```

Whole file tree in one request — cheaper than walking `/contents`:

```bash
curl -s "https://api.github.com/repos/owner/repo/git/trees/main?recursive=1" | jq -r '.tree[].path'
```

**Probe without side effects.** `gh --version` writes a device-id file on first run. When only checking availability:

```bash
GH_TELEMETRY=false DO_NOT_TRACK=true GH_NO_UPDATE_NOTIFIER=1 gh --version
```

**Check auth without a network call** — read `~/.config/gh/hosts.yml` directly rather than `gh auth status`, which hits the network and can refresh tokens.

---

## YouTube

`yt-dlp` for everything. No API key, no Data API v3 quota.

```bash
yt-dlp --dump-json "https://youtube.com/watch?v=ID" | jq '{title, duration, channel, view_count}'
yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format vtt -o '%(id)s' "URL"
yt-dlp --flat-playlist --dump-json "https://youtube.com/@channel/videos" | jq -r '.title'
```

Subtitles are the cheap path to content — `--write-auto-sub` gets machine captions when no human ones exist. Strip VTT before reading. Auto-captions repeat each line across cue boundaries and the repeats are not adjacent, so `uniq` does not remove them — dedupe against a set:

```bash
python3 -c '
import re, sys
seen = set()
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line or "-->" in line or line.startswith(("WEBVTT", "Kind:", "Language:")):
        continue
    line = re.sub(r"<[^>]*>", "", line).strip()
    if line and line not in seen:
        seen.add(line)
        print(line)
' ID.en.vtt
```

**JS runtime required.** yt-dlp ≥ 2025.11.12 needs one for YouTube:

- Deno — works with no config.
- Node — requires `--js-runtimes node` in `~/.config/yt-dlp/config`.

Missing runtime is the top failure mode; the error names extraction failure, not the runtime.

This machine is set up already: yt-dlp 2026.08.19 via Homebrew, node as JS runtime. On a fresh macOS box use `brew install yt-dlp` — `pip install` fails on Homebrew Python with a PEP 668 externally-managed error, and pipx is not present here.

```bash
brew install yt-dlp
mkdir -p ~/.config/yt-dlp && echo "--js-runtimes node" >> ~/.config/yt-dlp/config
```

Search without an API key:

```bash
yt-dlp --flat-playlist --dump-json "ytsearch10:query" | jq -r '.title + " | " + .url'
```

No captions and audio must be read → download audio and transcribe via Groq Whisper (free tier, `GROQ_API_KEY`) or OpenAI (`OPENAI_API_KEY`). Last resort: slow and costs money.

---

## Reddit

`.json` endpoints and default user-agents return 403 even from residential IPs. RSS/Atom feeds return 200 with a real browser UA. Curl+RSS is primary.

Always send a browser UA:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
curl -s -A "$UA" "https://www.reddit.com/r/programming/top/.rss?t=day"
```

| Feed | URL |
|---|---|
| Search (most useful) | `https://www.reddit.com/search.rss?q=<urlencoded>&sort=new` — results mix in subreddit entries; keep only links containing `/comments/`. Do not add `type=link` (returns empty feed). |
| Search in sub | `https://www.reddit.com/r/<sub>/search.rss?q=<q>&restrict_sr=1` |
| Subreddit new | `https://www.reddit.com/r/<sub>/.rss` |
| Subreddit hot | `https://www.reddit.com/r/<sub>/hot/.rss` |
| Subreddit top | `https://www.reddit.com/r/<sub>/top/.rss?t=hour\|day\|week\|month\|year\|all` |
| Post + comments | `https://www.reddit.com/r/<sub>/comments/<post-id>/.rss` |
| User activity | `https://www.reddit.com/user/<name>/.rss` |
| Multi-sub | `https://www.reddit.com/r/<sub1>+<sub2>/.rss` |

Output is Atom XML. Entries: `<entry>` with `<title>`, `<link href>`, `<author>`, `<updated>`, `<content type="html">` (HTML-escaped post body/preview). Post id is in `<id>` (`t3_<id>`).

Parse in a sandbox/script, not by eyeballing raw XML — feeds are large:

```bash
curl -s -A "$UA" "https://www.reddit.com/r/programming/top/.rss?t=day" \
  | python3 -c '
import sys, xml.etree.ElementTree as ET
ns = {"a": "http://www.w3.org/2005/Atom"}
for e in ET.parse(sys.stdin).getroot().findall("a:entry", ns):
    print(e.find("a:title", ns).text, "|", e.find("a:link", ns).get("href"))
'
```

**Method:** one `search.rss` fetch answers most questions — entries carry title, link, and body HTML. Comments needed → fetch `comments/<id>/.rss` for the 1–2 best posts only. Many drill-downs → private feed token or agent-browser.

### Rate limits

Since June 2025 Reddit throttles anonymous RSS hard:

- **~1 request per minute per IP** — exceeding returns 429, even on a different feed URL. Headers confirm: `x-ratelimit-used: 1`, `x-ratelimit-remaining: 0.0`, `x-ratelimit-reset: <seconds>`.
- Plan one fetch per question: pick the single best feed URL, parse everything from that response.
- OAuth does not lift the RSS limit.
- **Workaround:** append private-feed tokens `?user=<name>&feed=<token>` (from reddit.com/prefs/feeds) to any public feed URL, including `search.rss` — restores pre-throttle limits.
- On 429: read `x-ratelimit-reset`, wait that many seconds.

### RSS limits

~25 items per feed, no pagination. No scores, vote counts, or full comment trees. No posting or voting.

### When RSS is not enough

| Approach | Real-time | Auth | Notes |
|---|---|---|---|
| Official OAuth | Yes | Script app at reddit.com/prefs/apps | 60 req/min, full JSON incl. scores + pagination. Self-service registration closed 2025-11 — manual approval, individual scripts rarely granted. Viable only if you already hold credentials. |
| agent-browser | Yes | None | Drive real browser at `old.reddit.com` (lighter DOM). For deep comment trees, scores, infinite scroll. |
| `rdt-cli` | Yes | Browser cookies via `rdt login` | Install pinned: `pipx install 'git+https://github.com/public-clis/rdt-cli.git@5e4fb3720d5c174e976cd425ccc3b879d52cac66'` (PyPI lags upstream). Credentials at `~/.config/rdt-cli/credential.json`. |
| Arctic Shift API | Historical (days behind) | None | `curl "https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&limit=10"`. Pullpush.io similar but flaky. |
| Redlib RSS | Near | None | Self-hosted only with `ENABLE_RSS=on`. Public instances return 403/418 or browser-check (tested Aug 2026). |

OAuth recipe, if credentials exist:

```bash
TOKEN=$(curl -s -X POST https://www.reddit.com/api/v1/access_token \
  -u "CLIENT_ID:CLIENT_SECRET" -d "grant_type=client_credentials" | jq -r .access_token)
curl -H "Authorization: bearer $TOKEN" -H "User-Agent: mybot/0.1 by u/myuser" \
  "https://oauth.reddit.com/r/programming/hot.json?limit=10"
```

---

## Any Other URL

Jina Reader returns clean Markdown from any public page, no key:

```bash
curl -s -H "Accept: text/plain" "https://r.jina.ai/https://example.com/article"
```

Good for blogs, docs, and news behind mild anti-bot. Check the first few hundred bytes for a challenge page before trusting the body.

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reddit `.json` endpoints | 403 always, even with browser UA. Use `.rss`. |
| Default curl/fetch UA on Reddit | 403 `<title>Blocked</title>`. Send full Chrome UA. |
| `old.reddit.com/....rss` via curl | 302/403. Use `www.reddit.com` for feeds; old.reddit only via browser. |
| WebFetch on reddit.com | Blocked. Use curl with UA or agent-browser. |
| Rapid-fire Reddit requests | 429. ~1 req/min per IP. |
| yt-dlp extraction fails | Usually a missing JS runtime (deno/node), not a broken URL. |
| Walking GitHub `/contents` recursively | One `git/trees?recursive=1` call instead. |
| `gh auth status` as a health check | Hits network, may refresh tokens. Read `~/.config/gh/hosts.yml`. |
| Reading raw XML/JSON feeds into context | Parse in a script, print only what's needed. |
