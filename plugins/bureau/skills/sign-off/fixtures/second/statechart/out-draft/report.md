# ParcelLocker

TLC reached 26 states and 55 steps. The chart draws 6 states and 14 arrows.
The chart does not draw 9 steps that stay in one chart state.

## OneParcelPerDoor breaks
The shortest path has 2 steps:
0. Door empty
1. a courier drops it off: Parcel in the locker
2. a courier drops it off: Two parcels behind one door

## ExtraDayOnlyOnce breaks
The shortest path has 3 steps:
0. Door empty
1. a courier drops it off: Parcel in the locker
2. the resident asks for one more day: Parcel in the locker, one more day
3. the resident asks for one more day: Parcel in the locker, two more days

## Rules that hold
WellTyped, NothingPastItsWindow, NoDeadlock
