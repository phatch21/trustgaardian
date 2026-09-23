// Test-only helpers for /audit. Not exported from index.ts.

import type Database from "better-sqlite3";
import { migrate, openDb } from "../db/index.js";

export function makeTestDb(): Database.Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}
