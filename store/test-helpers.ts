// Fixture builders for /store tests only. Self-contained rather than
// importing another module's test-helpers.ts, matching the convention in
// tokens/test-helpers.ts and checkout/test-helpers.ts.

import type Database from "better-sqlite3";
import { migrate, openDb } from "../db/index.js";
import type { Cart, CartItem, Decision, Grant } from "../engine/types.js";
import type { Request } from "./types.js";

export function makeTestDb(): Database.Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
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

export function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    id: "request_1",
    grantId: "grant_1",
    rawUtterance: "find unicorn birthday party supplies under $80",
    structured: null,
    createdAt: "2026-01-01T00:00:00.000Z",
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
