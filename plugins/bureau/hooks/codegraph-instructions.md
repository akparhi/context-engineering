<codegraph>

## CodeGraph

This repo is indexed by CodeGraph. Reach for `codegraph_explore` BEFORE grep/find or reading files when you need to understand or locate code. It answers most code questions in one call: the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source.

**Graph or grep.** Use the graph for who calls X, what X calls, what breaks if X changes, and each hop of a flow. Use grep for route, queue and event names, strings, env vars and config keys. Bash, Markdown, JSON, YAML and Dockerfiles have no symbols, so an empty graph result there proves nothing.

**Trace a flow:**
1. List every branch first: each entry point, flag or mode, and provider. Traces that skip this stop after the first path.
2. Query one hop at a time, naming the symbols at both ends, such as `codegraph_explore "PaymentsFooterButton useApproveAndPay"`. A plain-language question returns a long, mixed answer, so use one only to find names.
3. Treat returned source as read. Do not reread it or check it with grep.
4. HTTP calls, queues, events and webhooks have no edges. Grep the route, queue or topic name across repos to find the receiver, then query from there.
5. Follow the return path: webhooks, consumers, jobs or polling, and what the caller shows.
6. Stop when every branch ends at a side effect or a system outside the workspace, and name each external system. Report one `file:line` per hop and what the graph could not see.

</codegraph>
