# LIB-7: holds on books that are out

The goal is in `goal.md`. The test plan is in `test-plan.md`.

## Scope

A member can place a hold on a book when every copy is lent. The member joins the line for that book and sees their place. When a copy comes back, the desk scan shelves it for the first member in line, prints a hold slip with their name, and emails them. The member has three opening days to collect it. After that the copy passes to the next member, or to the open shelf when nobody waits.

Members see their holds on a new My holds page and can cancel any of them. Desk librarians can cancel a hold for a member who asks at the desk.

Left out: holds on books with a copy on the open shelf, pausing a hold, and text message alerts.

## Screens

The book page gains a Place a hold form when every copy is out. My holds is a new page under the account menu. It shows that there are no holds, or the holds in line, and a ready hold opens its pickup details.

## Decisions

The desk scan shelves a returned copy at once, in place of a nightly job, so a member hears the same day. Ready emails go through the library's existing notices, in place of a new text message provider.

## Behavior

`statechart/HoldQueue.tla` models one copy, two members and the line in front of the copy. `plan.cfg` is this plan and `draft.cfg` is the plan before review. In the draft, a member who cancelled a hold on the shelf left the copy held for nobody. This plan passes the copy on. The rule that the desk never lends a held copy to someone else still breaks, because the desk app does not read holds. The printed slip is the guard until it does.

## Data

One new table, `book_holds`, with one row per hold. A book's line is its waiting rows in `placed_at` order. Two partial unique indexes keep one open hold per member and book, and one hold per shelved copy. The pickup branch has no foreign key, because branches live in another service. `design/db.sql` is the change and `design/base.sql` is the schema it applies to.

## API

Three new endpoints in shelf-api, described in `design/api.json`: place a hold, list the member's holds, and cancel a hold. Cancel takes a new permission, `holds:cancel-any`, for desk librarians. Everything sits behind the `holds` switch.

## Components

The page is built in shelf-web from the account layout. The side menu and the book page change. The search filters and the pager come from the loans page as they are.

## Units

### U1 Holds table and queue

The schema change for `book_holds` and the queue that finds the first member in line. Three tasks.

### U2 Holds endpoints

The three endpoints, the desk return that shelves a copy and prints a slip, and the night run that passes on uncollected copies. Five tasks. Needs U1.

### U3 My holds page

The My holds page, the Place a hold form, and the side menu entry. Six tasks. Needs U2 on staging, and starts on mock answers from `design/api.json`.

## Risks and defaults

The desk can still lend a held copy to the wrong member, and the slip is the only guard. Ready emails can land in spam, so My holds shows ready holds too. A missed night run delays a pass-on by one day at most.

Three opening days count from the morning after a copy is shelved. The pickup branch is the member's home branch unless they pick another.

## Pull requests

Three pull requests, in order. P1 and P2 go into `develop` in shelf-api and promote to `main`. P3 goes into `main` in shelf-web, which has no `develop` branch.

## Grant

The agent commits, pushes without force, opens the three pull requests and runs their checks. It asks before it merges P1 or P2 and before the holds switch goes on anywhere. The review bot may merge P3 once its checks pass.
