# PKG-112 checks

## Rows

| Id | Requirement | Row |
|---|---|---|
| chk-drop | N1 | A courier drops a parcel off and the resident hears within a minute. |
| chk-busy | N1 | A second parcel never goes behind a door that holds one. |
| chk-code | N1 | The code opens only the door with the resident's parcel. |
| chk-extend | N2 | A second ask for one more day is refused. |
| chk-sweep | N2 | A parcel two days old moves to the front desk. |
| chk-handover | N2 | The desk hands a parcel only to its resident. |

## How they run

Unit and behavior tests run in porter-api and locker-bridge with `bun test`. The app test runs Playwright against porter-app on mock answers. The lobby check runs on the test locker bank in the basement.
