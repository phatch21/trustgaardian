// npm run seed
//
// Creates the SQLite database, runs migrations, and inserts the one Grant
// /web's demo runs against (db/demo-grant.ts). Catalog fixture loading
// (docs/spec.md's /catalog) needs no seeding here — it's loaded directly
// from catalog/fixtures/catalog.json, not a database table.
//
// Idempotent: safe to run again against an existing database. Migrations
// are all `CREATE TABLE IF NOT EXISTS`, and the demo grant is only
// inserted if a row with DEMO_GRANT_ID doesn't already exist.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { makeDemoGrant } from "./demo-grant.js";
import { migrate, openDb } from "./index.js";
import { createGrant, getGrant } from "../store/index.js";

const DB_PATH = "data/trustgaardian.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = openDb(DB_PATH);
migrate(db);

const demoGrant = makeDemoGrant();
if (getGrant(db, demoGrant.id) === null) {
  createGrant(db, demoGrant);
  console.log(`Seeded demo grant ${demoGrant.id}`);
} else {
  console.log(`Demo grant ${demoGrant.id} already present`);
}

db.close();

console.log(`Seeded ${DB_PATH}`);
