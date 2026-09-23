// npm run seed
//
// Creates the SQLite database and runs migrations. Catalog fixture loading
// (docs/spec.md's /catalog) lands once fixture data exists; nothing to seed
// there yet.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate, openDb } from "./index.js";

const DB_PATH = "data/trustgaardian.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = openDb(DB_PATH);
migrate(db);
db.close();

console.log(`Seeded ${DB_PATH}`);
