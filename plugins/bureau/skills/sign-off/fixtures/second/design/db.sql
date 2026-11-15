-- Lobby parcel lockers. Applies to the tables in base.sql.
CREATE TYPE parcel_place AS ENUM ('locker', 'desk', 'collected', 'returned');

ALTER TABLE residents ADD COLUMN notify_by text NOT NULL DEFAULT 'push';

CREATE TABLE parcels (
  id uuid PRIMARY KEY,
  resident_id uuid NOT NULL REFERENCES residents (id),
  locker_id uuid REFERENCES lockers (id),
  place parcel_place NOT NULL DEFAULT 'locker',
  code_hash text NOT NULL,
  dropped_at timestamptz NOT NULL DEFAULT now(),
  collect_by timestamptz NOT NULL,
  extended_at timestamptz,
  courier text
);

COMMENT ON TABLE parcels IS 'One row per parcel a courier leaves in the lobby.';
COMMENT ON COLUMN parcels.locker_id IS 'Cleared when the parcel leaves its door.';

-- One parcel behind a door at a time, and the sweep reads parcels by their deadline.
CREATE UNIQUE INDEX parcels_one_per_door ON parcels (locker_id) WHERE place = 'locker';
CREATE INDEX parcels_due ON parcels (collect_by) WHERE place = 'locker';
