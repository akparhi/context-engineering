-- Holds on books that are out. Applies to the tables in base.sql.
CREATE TYPE hold_status AS ENUM ('waiting', 'on_shelf', 'collected', 'lapsed', 'cancelled', 'paused');

CREATE TABLE book_holds (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES books (id),
  member_id uuid NOT NULL REFERENCES members (id),
  status hold_status NOT NULL DEFAULT 'waiting',
  placed_at timestamptz NOT NULL DEFAULT now(),
  copy_id uuid REFERENCES copies (id),
  pickup_by timestamptz,
  pickup_branch_id uuid NOT NULL
);

COMMENT ON TABLE book_holds IS 'One row per hold. The queue for a book is its waiting rows in placed_at order.';
COMMENT ON COLUMN book_holds.copy_id IS 'Set when a returned copy is shelved for this hold.';
COMMENT ON COLUMN book_holds.pickup_branch_id IS 'Branches live in another service, so no foreign key.';

-- One open hold per member and book, and one hold per shelved copy.
CREATE UNIQUE INDEX book_holds_one_open_per_member
  ON book_holds (book_id, member_id) WHERE status IN ('waiting', 'on_shelf');
CREATE UNIQUE INDEX book_holds_one_per_shelved_copy
  ON book_holds (copy_id) WHERE status = 'on_shelf';
CREATE INDEX book_holds_queue ON book_holds (book_id, placed_at) WHERE status = 'waiting';
