# HoldQueue

TLC reached 171 states and 663 steps. The chart draws 7 states and 20 arrows.
The chart does not draw 533 steps that stay in one chart state.

## HeldForSomeone breaks
The shortest path has 3 steps:
0. Out on loan
1. a member places a hold: Out on loan, members waiting
2. the copy comes back: On the hold shelf
3. the member it waits for cancels: On the hold shelf for nobody

## NoTurnSkipped breaks
The shortest path has 3 steps:
0. Out on loan
1. a member places a hold: Out on loan, members waiting
2. the copy comes back: On the hold shelf
3. the desk lends it to someone else: Lent past a member's turn

## Rules that hold
TypeOK, OneHoldPerMember, OpenShelfOnlyWhenNobodyWaits, PickupWindowKept, NoDeadlock
