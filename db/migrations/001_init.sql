-- Schema from docs/spec.md. Money is integer cents everywhere.

CREATE TABLE IF NOT EXISTS grants (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  status            TEXT NOT NULL,
  constraints_json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id                TEXT PRIMARY KEY,
  grant_id          TEXT NOT NULL REFERENCES grants(id),
  raw_utterance     TEXT NOT NULL,
  structured_json   TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS carts (
  id                TEXT PRIMARY KEY,
  request_id        TEXT NOT NULL REFERENCES requests(id),
  items_json        TEXT NOT NULL,
  total_cents       INTEGER NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id                TEXT PRIMARY KEY,
  cart_id           TEXT NOT NULL REFERENCES carts(id),
  verdict           TEXT NOT NULL,
  rule_results_json TEXT NOT NULL,
  evaluated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  nonce             TEXT PRIMARY KEY,
  grant_id          TEXT NOT NULL REFERENCES grants(id),
  agent_id          TEXT NOT NULL,
  cart_hash         TEXT NOT NULL,
  issued_at         TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  consumed_at       TEXT
);

CREATE TABLE IF NOT EXISTS audit (
  seq               INTEGER PRIMARY KEY AUTOINCREMENT,
  prev_hash         TEXT NOT NULL,
  timestamp         TEXT NOT NULL,
  actor             TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  payload_hash      TEXT NOT NULL,
  entry_hash        TEXT NOT NULL
);
