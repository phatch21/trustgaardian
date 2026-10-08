// Returns the demo database to the state `npm run seed` produces on a fresh
// file: every table empty except the one demo Grant, and the audit chain
// back at genesis. Exists because /web's demo controls mutate persistent
// state (tamper-audit rewrites a row on purpose) and seed alone can't undo
// that — it only inserts what's missing. See docs/friction.md, 2026-10-08.
//
// Touches only the database handle it's given. Catalog fixtures, keys and
// everything else on disk are out of reach by construction.

import type Database from "better-sqlite3";
import { createGrant } from "../store/index.js";
import { makeDemoGrant } from "./demo-grant.js";

// Children before parents, so foreign_keys = ON never sees a dangling
// reference mid-reset. audit has no foreign keys; it goes first only so
// the chain is gone before anything else is.
const TABLES_IN_DELETE_ORDER = ["audit", "tokens", "decisions", "carts", "requests", "grants"] as const;

export function resetDemoState(db: Database.Database): void {
  const run = db.transaction(() => {
    for (const table of TABLES_IN_DELETE_ORDER) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    // audit.seq is AUTOINCREMENT, which never reuses a value even after
    // DELETE — without this the next entry would be seq N+1 with genesis
    // prev_hash, and verifyChain would report seq_gap at seq 1. Removing
    // the sqlite_sequence row restarts the counter at 1.
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'audit'").run();
    createGrant(db, makeDemoGrant());
  });

  run.immediate();
}
