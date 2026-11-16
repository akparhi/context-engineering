# HoldQueue

TLC reached 111 states and 423 steps. The chart draws 6 states and 13 arrows.
The chart does not draw 318 steps that stay in one chart state.

## NoTurnSkipped breaks
The shortest path has 3 steps:
0. Out on loan
1. a member places a hold: Out on loan, members waiting
2. the copy comes back: On the hold shelf
3. the desk lends it to someone else: Lent past a member's turn

## Rules that hold
TypeOK, HeldForSomeone, OneHoldPerMember, OpenShelfOnlyWhenNobodyWaits, PickupWindowKept, NoDeadlock
