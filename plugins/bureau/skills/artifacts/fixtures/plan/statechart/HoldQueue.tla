---- MODULE HoldQueue ----
\* One copy of a book, two members, and the hold queue in front of it.
EXTENDS Naturals, Sequences

CONSTANTS DeskChecksHolds, CancelPassesOn

Members == {"Ana", "Ben"}
PickupDays == 3
None == "none"

VARIABLES copy, queue, heldFor, days, skipped
vars == <<copy, queue, heldFor, days, skipped>>

InQueue(m) == \E i \in 1..Len(queue) : queue[i] = m
Without(s, m) == SelectSeq(s, LAMBDA x : x # m)

\* The copy goes to the first member in line, or to the open shelf when nobody waits.
ShelveForNext ==
  IF queue = <<>>
  THEN copy' = "open shelf" /\ heldFor' = None /\ queue' = queue
  ELSE copy' = "hold shelf" /\ heldFor' = Head(queue) /\ queue' = Tail(queue)

Init == copy = "lent" /\ queue = <<>> /\ heldFor = None /\ days = 0 /\ skipped = None

PlaceHold(m) ==
  /\ copy # "open shelf" /\ ~InQueue(m) /\ heldFor # m
  /\ queue' = Append(queue, m)
  /\ UNCHANGED <<copy, heldFor, days, skipped>>

CancelWaiting(m) ==
  /\ InQueue(m)
  /\ queue' = Without(queue, m)
  /\ UNCHANGED <<copy, heldFor, days, skipped>>

Return == copy = "lent" /\ ShelveForNext /\ days' = 0 /\ UNCHANGED skipped

Collect ==
  /\ copy = "hold shelf"
  /\ copy' = "lent" /\ heldFor' = None
  /\ UNCHANGED <<queue, days, skipped>>

DayPasses ==
  /\ copy = "hold shelf" /\ days < PickupDays
  /\ days' = days + 1
  /\ UNCHANGED <<copy, queue, heldFor, skipped>>

Lapse == copy = "hold shelf" /\ days = PickupDays /\ ShelveForNext /\ days' = 0 /\ UNCHANGED skipped

CancelOnShelf ==
  /\ copy = "hold shelf" /\ heldFor # None
  /\ IF CancelPassesOn
     THEN ShelveForNext /\ days' = 0
     ELSE heldFor' = None /\ UNCHANGED <<copy, queue, days>>
  /\ UNCHANGED skipped

Borrow ==
  /\ copy = "open shelf"
  /\ copy' = "lent"
  /\ UNCHANGED <<queue, heldFor, days, skipped>>

DeskLendsHeldCopy ==
  /\ ~DeskChecksHolds /\ copy = "hold shelf" /\ heldFor # None
  /\ copy' = "lent" /\ skipped' = heldFor /\ heldFor' = None
  /\ UNCHANGED <<queue, days>>

Next ==
  \/ \E m \in Members : PlaceHold(m)
  \/ \E m \in Members : CancelWaiting(m)
  \/ Return \/ Collect \/ DayPasses \/ Lapse \/ CancelOnShelf \/ Borrow \/ DeskLendsHeldCopy

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ copy \in {"lent", "hold shelf", "open shelf"}
  /\ heldFor \in Members \cup {None}
  /\ days \in 0..PickupDays
  /\ skipped \in Members \cup {None}
  /\ \A i \in 1..Len(queue) : queue[i] \in Members

HeldForSomeone == copy = "hold shelf" => heldFor # None
NoTurnSkipped == skipped = None
OneHoldPerMember ==
  /\ \A i, j \in 1..Len(queue) : i # j => queue[i] # queue[j]
  /\ ~InQueue(heldFor)
OpenShelfOnlyWhenNobodyWaits == copy = "open shelf" => queue = <<>>
PickupWindowKept == days <= PickupDays
====
