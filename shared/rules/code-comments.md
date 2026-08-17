---
paths:
  - "**/*.{ts,tsx,js,jsx,mjs,cjs}"
  - "**/*.{py,go,rs,rb,java,kt,swift,c,h,cpp,hpp,cs,php,sql,sh,zsh}"
---

# Code comments

Default = no comment. One line, two max — longer means a jsdoc/similar comment.

- Inline comments say **why**, never what. Doc comments may say what + contract.
- Earn one only for: a non-obvious constraint, a landmine, or a deliberate shortcut with its upgrade path.
- **Never narrate the diff** — no "changed from", "previously", "we used to". Git owns history.

```ts
// bad: history + restating
// We used to fetch in useEffect but that double-fetched on mount. 30 min for admins.
const timeout = auth?.role === 'Admin' ? 30 * 60 * 1000 : 15 * 60 * 1000

// good: names carry it
const IDLE_TIMEOUT_ADMIN = 30 * 60 * 1000
const IDLE_TIMEOUT_USER = 15 * 60 * 1000
```
