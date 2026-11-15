-- The tables this plan joins, as they stand today. db.sql applies to these.
CREATE TABLE branches (
  id uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE books (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  author text NOT NULL,
  isbn text
);

CREATE TABLE members (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  home_branch_id uuid NOT NULL REFERENCES branches (id)
);

CREATE TABLE copies (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES books (id),
  branch_id uuid NOT NULL REFERENCES branches (id),
  shelf_code text NOT NULL
);
