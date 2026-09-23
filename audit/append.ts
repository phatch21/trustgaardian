// Appends one entry to the hash-chained audit log. This is the one place
// in /audit that touches the database.

import type Database from "better-sqlite3";
import { GENESIS_PREV_HASH, computeEntryHash, payloadHash as hashPayload } from "./hash.js";
import type { AuditEntry, EventType } from "./types.js";

interface TailRow {
  entry_hash: string;
}

export function appendEntry(
  db: Database.Database,
  actor: string,
  eventType: EventType,
  payload: unknown,
  now: string,
): AuditEntry {
  const payloadHashValue = hashPayload(payload);

  // The tail read and the insert happen inside one transaction, taken with
  // an immediate write lock (not deferred), so a second concurrent append
  // can't read the same tail and fork the chain — it has to wait for this
  // transaction to commit first.
  const run = db.transaction((): AuditEntry => {
    const tail = db.prepare("SELECT entry_hash FROM audit ORDER BY seq DESC LIMIT 1").get() as
      | TailRow
      | undefined;
    const prevHash = tail?.entry_hash ?? GENESIS_PREV_HASH;
    const entryHash = computeEntryHash(prevHash, now, actor, eventType, payloadHashValue);

    const info = db
      .prepare(
        `INSERT INTO audit (prev_hash, timestamp, actor, event_type, payload_hash, entry_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(prevHash, now, actor, eventType, payloadHashValue, entryHash);

    return {
      seq: Number(info.lastInsertRowid),
      prevHash,
      timestamp: now,
      actor,
      eventType,
      payloadHash: payloadHashValue,
      entryHash,
    };
  });

  return run.immediate();
}
