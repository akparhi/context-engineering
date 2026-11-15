-- The tables this plan joins, as they stand today. db.sql applies to these.
CREATE TABLE residents (
  id uuid PRIMARY KEY,
  flat text NOT NULL,
  name text NOT NULL,
  phone text
);

CREATE TABLE lockers (
  id uuid PRIMARY KEY,
  bank text NOT NULL,
  door_number integer NOT NULL,
  size text NOT NULL
);
