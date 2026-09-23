// Fixture builders for engine tests only. Not exported from index.ts.

import type { Cart, CartItem, Grant, GrantConstraints } from "./types.js";

export function makeConstraints(overrides: Partial<GrantConstraints> = {}): GrantConstraints {
  return {
    spend: { perTransactionCents: 10_000, perWindowCents: 50_000, window: "P7D", currency: "USD" },
    merchants: { allow: [], deny: [] },
    categories: { allow: [], deny: [] },
    frequency: { maxPurchases: 10, window: "P7D" },
    items: { maxUnitPriceCents: 5_000, maxQuantity: 5 },
    escalation: { requireApprovalAboveCents: 20_000, autoDenyOn: [] },
    ...overrides,
  };
}

export function makeGrant(overrides: Partial<Grant> = {}): Grant {
  return {
    id: "grant_1",
    userId: "user_1",
    agentId: "agent_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    status: "active",
    constraints: makeConstraints(),
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
