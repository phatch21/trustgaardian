// Fixture builders for /tokens tests only. Deliberately self-contained
// rather than importing engine/test-helpers.ts, so this test suite stays
// decoupled from engine's internals the same way the source does.

import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import type { Cart, CartItem, Decision, Grant, Verdict } from "../engine/types.js";

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
    verdict: (overrides.verdict ?? "allow") as Verdict,
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
