// Reads the chain in seq order for display. Read-only, and not itself a
// verification: a caller that needs to know whether the chain is intact
// still calls verifyChain — this just returns what's there, tampered rows
// included, which is exactly what /web's "view the audit chain" panel and
// tamper demo control need.

import type Database from "better-sqlite3";
import type { AuditEntry, EventType } from "./types.js";

interface AuditRow {
  seq: number;
  prev_hash: string;
  timestamp: string;
  actor: string;
  event_type: string;
  payload_hash: string;
  entry_hash: string;
}

export function listEntries(db: Database.Database): AuditEntry[] {
  const rows = db
    .prepare(
      `SELECT seq, prev_hash, timestamp, actor, event_type, payload_hash, entry_hash
       FROM audit ORDER BY seq ASC`,
    )
    .all() as AuditRow[];

  return rows.map((row) => ({
    seq: row.seq,
    prevHash: row.prev_hash,
    timestamp: row.timestamp,
    actor: row.actor,
    eventType: row.event_type as EventType,
    payloadHash: row.payload_hash,
    entryHash: row.entry_hash,
  }));
}
