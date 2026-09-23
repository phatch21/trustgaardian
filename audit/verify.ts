// Walks the audit chain from genesis and reports the first break, if any.
//
// Per row, in seq order, three checks run in this order and stop at the
// first failure:
//   1. seq_gap — is this row's seq the next one expected? A deleted row
//      makes the following row's stored prev_hash unverifiable (the entry
//      it points to no longer exists), so the gap must be caught before
//      attempting a link or hash check that would otherwise misreport it
//      as a broken link.
//   2. broken_link — does this row's stored prev_hash equal the previous
//      row's (already-verified) entry_hash, or the genesis zero for the
//      first row?
//   3. hash_mismatch — does a fresh SHA-256 over this row's own stored
//      fields equal its stored entry_hash?
//
// Directly overwriting one row's entry_hash (leaving its prev_hash and
// other fields untouched) is always caught by check 3 on that same row,
// never as a broken_link on the following row: check 3 runs before we ever
// advance to the next seq, so the earliest break in seq order is always
// the row whose own hash no longer matches what it claims. A genuine
// broken_link requires the *link* itself to be wrong — this row's stored
// prev_hash not equaling its predecessor's real hash — while the row
// remains internally self-consistent.
//
// An empty audit table verifies as ok: true; there's nothing to break.

import type Database from "better-sqlite3";
import { GENESIS_PREV_HASH, computeEntryHash } from "./hash.js";
import type { VerifyChainResult } from "./types.js";

interface AuditRow {
  seq: number;
  prev_hash: string;
  timestamp: string;
  actor: string;
  event_type: string;
  payload_hash: string;
  entry_hash: string;
}

export function verifyChain(db: Database.Database): VerifyChainResult {
  const rows = db
    .prepare(
      `SELECT seq, prev_hash, timestamp, actor, event_type, payload_hash, entry_hash
       FROM audit ORDER BY seq ASC`,
    )
    .all() as AuditRow[];

  let expectedPrevHash = GENESIS_PREV_HASH;
  let expectedSeq = 1;

  for (const row of rows) {
    if (row.seq !== expectedSeq) {
      return { ok: false, seq: expectedSeq, reason: "seq_gap" };
    }

    if (row.prev_hash !== expectedPrevHash) {
      return { ok: false, seq: row.seq, reason: "broken_link" };
    }

    const recomputed = computeEntryHash(
      row.prev_hash,
      row.timestamp,
      row.actor,
      row.event_type,
      row.payload_hash,
    );
    if (recomputed !== row.entry_hash) {
      return { ok: false, seq: row.seq, reason: "hash_mismatch" };
    }

    expectedPrevHash = row.entry_hash;
    expectedSeq += 1;
  }

  return { ok: true };
}
