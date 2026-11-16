# LIB-7 test plan

## Acceptance

| Id | Requirement | Row |
|---|---|---|
| A1 | R1 | Every copy of a book is lent. A member places a hold, joins the line and sees their place. |
| A2 | R1 | A member who already holds a book cannot hold it again. |
| A3 | R2 | Two members wait for a book. The desk scans a returned copy, which is shelved for the first of them. |
| A4 | R2 | Every copy shelved for a hold carries a printed slip with the member's name. |
| A5 | R3 | A copy has waited three opening days. The night run passes it to the next member, or to the open shelf. |
| A6 | R3 | The member gets an email the day their copy is shelved. |
| A7 | R4 | My holds lists every open hold with its place in line or its pickup day. |
| A8 | R5 | When the member a shelved copy waits for cancels, the copy passes on. |
| A9 | none | Holds on the paper lists stay on paper until the desk moves them by hand. |

## Tests

Unit tests run in shelf-api with `bun test`. Behavior tests start shelf-api against a test database. The end-to-end tests run Playwright against shelf-web on mock answers. The live check runs on the staging library with a test copy and a test member.

A9 has no test. The desk moves the paper lists by hand in the week after launch.
