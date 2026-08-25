---
name: reddit
description: Use when searching Reddit or fetching Reddit content — search queries, subreddit posts, comments, user activity — from an agent/CLI.
---

# Reddit Access

## Overview

Reddit blocks bots: `.json` endpoints and default user-agents return 403 even from residential IPs. RSS/Atom feeds (`.rss`) return 200 when sent a real browser user-agent. Curl+RSS is the primary path; agent-browser is the fallback for anything RSS can't reach.

## Quick Reference

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

Parse in a sandbox/script, not by eyeballing raw XML — feeds are large. Example extraction:

```bash
curl -s -A "$UA" "https://www.reddit.com/r/programming/top/.rss?t=day" \
  | python3 -c '
import sys, xml.etree.ElementTree as ET
ns = {"a": "http://www.w3.org/2005/Atom"}
for e in ET.parse(sys.stdin).getroot().findall("a:entry", ns):
    print(e.find("a:title", ns).text, "|", e.find("a:link", ns).get("href"))
'
```

## Research Methodology

1. One `search.rss` fetch — entries carry title, link, and post body HTML in `<content>`; answer from this single response when possible.
2. Comments needed → fetch `comments/<id>/.rss` for the 1–2 best posts only; each extra fetch costs ~60s (rate limit below).
3. Many drill-downs → private feed token or agent-browser (see below).

## Rate Limits

Since June 2025 Reddit throttles anonymous RSS hard:

- **~1 request per minute per IP** — exceeding returns HTTP 429, even on a different feed URL. Headers confirm: `x-ratelimit-used: 1`, `x-ratelimit-remaining: 0.0`, `x-ratelimit-reset: <seconds>` (~60s window). Previously ~100 requests per 10 minutes.
- Plan one fetch per question: pick the single best feed URL, parse everything from that one response.
- OAuth does not lift the RSS limit. (General JSON API: 100 req/min OAuth, 10 req/min without — but JSON is blocked anyway.)
- **Workaround:** append private-feed tokens `?user=<name>&feed=<token>` (from reddit.com/prefs/feeds) to any public feed URL, including `search.rss` — restores pre-throttle limits.
- On 429: read `x-ratelimit-reset` and wait that many seconds; batch questions per feed instead of re-fetching.

## Limitations of RSS

- ~25 items per feed, no pagination.
- No scores, vote counts, or full comment trees (comment feed is shallow).
- No posting, voting, or anything authenticated.

## Alternatives When RSS Not Enough

| Approach | Real-time | Auth | Notes |
|---|---|---|---|
| Redlib RSS (self-hosted only) | Near | None | Public instances unusable via curl (tested Aug 2026: all 6 listed instances return 403/418 or Anubis browser-check). Only viable self-hosted with `ENABLE_RSS=on`. Instance list: github.com/redlib-org/redlib-instances. |
| agent-browser | Yes | None | Drive real browser at `old.reddit.com` (lighter DOM). For deep comment trees, scores, infinite scroll. |
| Arctic Shift API | Historical (days behind) | None | `curl "https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=<sub>&limit=10"`. Pullpush.io similar but flaky. |
| Official OAuth (best for heavy use) | Yes | Free script app at reddit.com/prefs/apps | 60 req/min, full JSON incl. scores + pagination. The `.json` 403 only hits unauthenticated requests. |

OAuth recipe:

```bash
TOKEN=$(curl -s -X POST https://www.reddit.com/api/v1/access_token \
  -u "CLIENT_ID:CLIENT_SECRET" -d "grant_type=client_credentials" | jq -r .access_token)
curl -H "Authorization: bearer $TOKEN" -H "User-Agent: mybot/0.1 by u/myuser" \
  "https://oauth.reddit.com/r/programming/hot.json?limit=10"
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Hitting `.json` endpoints | 403 always, even with browser UA. Use `.rss`. |
| Default curl/fetch UA | 403 `<title>Blocked</title>`. Send full Chrome UA string. |
| `old.reddit.com/....rss` via curl | 302/403. Use `www.reddit.com` for feeds; old.reddit only via browser. |
| WebFetch on reddit.com | Blocked. Use curl with UA or agent-browser. |
| Rapid-fire requests | 429. Limit is ~1 req/min per feed URL — see Rate Limits. |
