---- MODULE ParcelLocker ----
\* One locker door in the lobby, the parcels couriers put behind it, and the front desk.
EXTENDS Naturals

CONSTANTS BridgeChecksDoor, OneExtraDay

Window == 2
MaxAsks == 2

VARIABLES inDoor, atDesk, extensions, days
vars == <<inDoor, atDesk, extensions, days>>

Due == Window + extensions

Init == inDoor = 0 /\ atDesk = FALSE /\ extensions = 0 /\ days = 0

Drop ==
  /\ ~atDesk
  /\ IF BridgeChecksDoor THEN inDoor = 0 ELSE inDoor < 2
  /\ inDoor' = inDoor + 1
  /\ days' = IF inDoor = 0 THEN 0 ELSE days
  /\ UNCHANGED <<atDesk, extensions>>

Open ==
  /\ inDoor >= 1
  /\ inDoor' = 0 /\ extensions' = 0 /\ days' = 0
  /\ UNCHANGED atDesk

Extend ==
  /\ inDoor = 1 /\ days < Due
  /\ extensions < (IF OneExtraDay THEN 1 ELSE MaxAsks)
  /\ extensions' = extensions + 1
  /\ UNCHANGED <<inDoor, atDesk, days>>

DayPasses ==
  /\ inDoor = 1 /\ days < Due
  /\ days' = days + 1
  /\ UNCHANGED <<inDoor, atDesk, extensions>>

Sweep ==
  /\ inDoor = 1 /\ extensions = 0 /\ days = Due
  /\ inDoor' = 0 /\ atDesk' = TRUE /\ days' = 0
  /\ UNCHANGED extensions

ExtraDayEnds ==
  /\ inDoor = 1 /\ extensions > 0 /\ days = Due
  /\ inDoor' = 0 /\ atDesk' = TRUE /\ extensions' = 0 /\ days' = 0

Handover ==
  /\ atDesk
  /\ atDesk' = FALSE
  /\ UNCHANGED <<inDoor, extensions, days>>

Next == Drop \/ Open \/ Extend \/ DayPasses \/ Sweep \/ ExtraDayEnds \/ Handover
Spec == Init /\ [][Next]_vars

WellTyped == inDoor \in 0..2 /\ atDesk \in BOOLEAN /\ extensions \in 0..MaxAsks /\ days \in 0..(Window + MaxAsks)
OneParcelPerDoor == inDoor <= 1
ExtraDayOnlyOnce == extensions <= 1
NothingPastItsWindow == inDoor = 1 => days <= Due
====
