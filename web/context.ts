// The dependencies every /web handler needs, bundled once at server
// startup. Nothing here does I/O itself — server.ts owns opening the
// database and loading the catalog; this just holds the result plus one
// signing keypair generated for the life of the process, so a token issued
// on one request can still be verified by a later one (the demo controls
// depend on this: they re-present a token issued earlier in the same
// server run).

import { generateKeyPairSync, type KeyObject } from "node:crypto";
import type Database from "better-sqlite3";
import type { CatalogItem } from "../catalog/types.js";

export interface AppContext {
  db: Database.Database;
  catalog: CatalogItem[];
  privateKey: KeyObject;
  publicKey: KeyObject;
  // Server-wide default for whether /api/utterance calls the real Bedrock
  // agent, read once from AGENT_MODE at startup. Overridable per request
  // via the `live` query flag — see server.ts.
  defaultLive: boolean;
}

export function createAppContext(db: Database.Database, catalog: CatalogItem[]): AppContext {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    db,
    catalog,
    privateKey,
    publicKey,
    defaultLive: process.env.AGENT_MODE === "live",
  };
}
