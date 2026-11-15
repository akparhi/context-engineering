# PKG-112: parcel lockers in the lobby

The goal is in `goal.md`. The checks are in `checks.md`.

## What changes

When a courier closes a locker door on a parcel, the resident gets a message with a pickup code and sees the parcel in the app. The code opens that door only. The resident has two days to collect, and can ask once for one more day. After that the front desk takes the parcel out and keeps it for the resident.

Left out: returning a parcel to the courier, and lockers in other buildings.

## Parcels screen

The resident app gains a Parcels tab. It lists each parcel with its door and the day to collect by. Tapping a parcel shows the code and a One more day button. A parcel moved to the front desk says so.

## Choices

An hourly sweep moves late parcels to the front desk list, in place of the locker unlocking itself at the deadline.

## How a door moves

`statechart/ParcelLocker.tla` models one door, the parcels couriers bring to it, and the front desk. `plan.cfg` is this plan and `draft.cfg` is the plan before review. In the draft, the bridge did not check that a door was empty, and a resident could ask for more days without limit. Both rules hold in this plan.

## Storage

One new table, `parcels`, with one row per parcel. `residents` gains `notify_by`. A partial unique index keeps one parcel behind each door. `design/db.sql` is the change and `design/base.sql` is the schema it applies to.

## Endpoints

Five new endpoints in porter-api, described in `design/openapi.json`. The locker bridge reports drops and code entries. Residents list their parcels and ask for one more day. The front desk hands parcels over with a new permission, `parcels:handover`. Everything sits behind the `lockers` switch.

## App parts

The Parcels tab is built in porter-app inside the resident shell. The bottom tabs change. The locker bridge keeps its door driver and gains a drop reporter.

## Work

Five units in three repos. W1 comes first. W2 and W3 need it. W4 and W5 need W2.

### W1 Parcels table and sweep

The migration for `parcels`, the new resident column, and the hourly sweep that moves late parcels to the front desk.

### W2 Locker and desk endpoints

The five endpoints, with the code check and the front desk handover.

### W3 Arrival messages

The push message and the text message a resident gets when a parcel lands.

### W4 Bridge drop reporter

The locker bridge reports each closed door to porter-api, and refuses a second parcel on a busy door.

### W5 Parcels tab

The Parcels tab, the code sheet and the front desk notice in porter-app.

## Hazards

A power cut keeps every door shut until the lockers restart. Text messages cost money per send.

The two days count from the moment the courier closes the door.

## Merging

Four pull requests. Two go into porter-api, one into locker-bridge and one into porter-app.

## What the agent may do

The agent commits, pushes without force, opens the four pull requests and runs their checks. It asks before it merges anything into porter-api or locker-bridge, and before the lockers switch goes on. The review bot may merge the porter-app pull request once its checks pass.
