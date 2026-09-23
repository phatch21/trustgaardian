// Test-only fixtures for /checkout. Self-contained like the other
// modules' test-helpers.ts rather than importing theirs.

import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { migrate, openDb } from "../db/index.js";
import type { Cart, CartItem, Decision, Grant } from "../engine/types.js";
import { issueToken } from "../tokens/index.js";
import type { ExecutionToken } from "../tokens/types.js";
import { persistIssuedToken } from "./persist.js";

export function makeTestDb(): Database.Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}

// A real on-disk db, for tests that need two separate connections to see
// the same data — :memory: databases are private per connection.
export function makeTempFileDb(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "trustgaardian-checkout-"));
  const path = join(dir, "test.db");
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function makeGrant(overrides: Partial<Grant> = {}): Grant {
  return {
    id: "grant_1",
    userId: "user_1",
    agentId: "agent_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    status: "active",
    constraints: {},
    ...overrides,
  };
}

export function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    sku: "sku_1",
    merchant: "acme",
    unitPriceCents: 1_000,
    quantity: 1,
    category: "books",
    ...overrides,
  };
}

export function makeCart(overrides: Partial<Cart> = {}): Cart {
  const items = overrides.items ?? [makeItem()];
  const totalCents =
    overrides.totalCents ??
    items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

  return {
    id: overrides.id ?? "cart_1",
    requestId: overrides.requestId ?? "request_1",
    items,
    totalCents,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  };
}

export function makeDecision(overrides: Partial<Decision> = {}): Decision {
  return {
    id: "decision_1",
    cartId: "cart_1",
    verdict: "allow",
    ruleResults: [],
    evaluatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function makeRequestHash(seed = "request_1"): string {
  return createHash("sha256").update(seed).digest("hex");
}

export function makeKeyPair(): { publicKey: KeyObject; privateKey: KeyObject } {
  return generateKeyPairSync("ed25519");
}

// tokens.grant_id has a foreign key to grants(id). There's no /grants
// persistence module yet, so tests that persist a token need a matching
// grants row to exist first — this is test-only scaffolding for that FK,
// not a real grants store.
export function persistGrantForFk(db: Database.Database, grant: Grant): void {
  db.prepare(
    `INSERT INTO grants (id, user_id, agent_id, created_at, expires_at, status, constraints_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    grant.id,
    grant.userId,
    grant.agentId,
    grant.createdAt,
    grant.expiresAt,
    grant.status,
    JSON.stringify(grant.constraints),
  );
}

// Exercises the real issuance path this task added: issueToken() (pure,
// from /tokens) followed by persistIssuedToken() (the write /checkout
// needs at lookup time). Also persists the grant row the FK requires.
export function issueAndPersistToken(
  db: Database.Database,
  decision: Decision,
  grant: Grant,
  cart: Cart,
  requestHash: string,
  now: string,
  nonce: string,
  privateKey: KeyObject,
): ExecutionToken {
  persistGrantForFk(db, grant);
  const token = issueToken(decision, grant, cart, requestHash, now, nonce, privateKey);
  persistIssuedToken(db, token);
  return token;
}
