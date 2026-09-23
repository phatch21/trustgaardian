import { describe, expect, it } from "vitest";
import { ruleDenyLists, ruleGrantValidity, ruleItemLimits, ruleTransactionCap } from "./rules.js";
import { makeCart, makeConstraints, makeGrant, makeItem } from "./test-helpers.js";

const NOW = "2026-06-01T00:00:00.000Z";

describe("ruleGrantValidity", () => {
  it("passes an active, unexpired grant issued to the calling agent", () => {
    const grant = makeGrant({ status: "active", expiresAt: "2027-01-01T00:00:00.000Z", agentId: "agent_1" });
    const result = ruleGrantValidity(grant, "agent_1", NOW);
    expect(result).toMatchObject({ ruleId: "grant_validity", passed: true });
  });

  it("denies a grant that is not active", () => {
    const grant = makeGrant({ status: "revoked" });
    const result = ruleGrantValidity(grant, "agent_1", NOW);
    expect(result).toMatchObject({ ruleId: "grant_validity", passed: false, reason: "grant_not_active" });
  });

  it("denies an expired grant", () => {
    const grant = makeGrant({ expiresAt: "2025-01-01T00:00:00.000Z" });
    const result = ruleGrantValidity(grant, "agent_1", NOW);
    expect(result).toMatchObject({ ruleId: "grant_validity", passed: false, reason: "grant_expired" });
  });

  it("denies when the calling agent does not match the grant's agent_id", () => {
    const grant = makeGrant({ agentId: "agent_1" });
    const result = ruleGrantValidity(grant, "agent_2", NOW);
    expect(result).toMatchObject({ ruleId: "grant_validity", passed: false, reason: "agent_mismatch" });
  });

  it("fails closed on an unparseable expiry timestamp", () => {
    const grant = makeGrant({ expiresAt: "not-a-date" });
    const result = ruleGrantValidity(grant, "agent_1", NOW);
    expect(result).toMatchObject({ ruleId: "grant_validity", passed: false, reason: "unparseable_timestamp" });
  });
});

describe("ruleDenyLists", () => {
  it("passes when the item's merchant and category are on neither deny list", () => {
    const constraints = makeConstraints();
    const cart = makeCart({ items: [makeItem({ merchant: "acme", category: "books" })] });
    const result = ruleDenyLists(cart, constraints);
    expect(result).toMatchObject({ ruleId: "deny_lists", passed: true });
  });

  it("denies when the item's merchant is on the deny list", () => {
    const constraints = makeConstraints({ merchants: { allow: [], deny: ["shady-co"] } });
    const cart = makeCart({ items: [makeItem({ merchant: "shady-co" })] });
    const result = ruleDenyLists(cart, constraints);
    expect(result).toMatchObject({ ruleId: "deny_lists", passed: false, reason: "merchant_denied" });
  });

  it("denies when the item's category is on the deny list", () => {
    const constraints = makeConstraints({ categories: { allow: [], deny: ["weapons"] } });
    const cart = makeCart({ items: [makeItem({ category: "weapons" })] });
    const result = ruleDenyLists(cart, constraints);
    expect(result).toMatchObject({ ruleId: "deny_lists", passed: false, reason: "category_denied" });
  });

  it("denies when an allow list is set and the item's merchant is not on it", () => {
    const constraints = makeConstraints({ merchants: { allow: ["only-this-one"], deny: [] } });
    const cart = makeCart({ items: [makeItem({ merchant: "acme" })] });
    const result = ruleDenyLists(cart, constraints);
    expect(result).toMatchObject({ ruleId: "deny_lists", passed: false, reason: "merchant_not_allowed" });
  });

  it("fails closed when constraints did not parse", () => {
    const cart = makeCart();
    const result = ruleDenyLists(cart, null);
    expect(result).toMatchObject({ ruleId: "deny_lists", passed: false, reason: "unparseable_constraints" });
  });
});

describe("ruleItemLimits", () => {
  it("passes when every item is within the unit price and quantity limits", () => {
    const constraints = makeConstraints({ items: { maxUnitPriceCents: 5_000, maxQuantity: 5 } });
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 4_999, quantity: 5 })] });
    const result = ruleItemLimits(cart, constraints);
    expect(result).toMatchObject({ ruleId: "item_limits", passed: true });
  });

  it("denies when an item's unit price exceeds the limit", () => {
    const constraints = makeConstraints({ items: { maxUnitPriceCents: 5_000, maxQuantity: 5 } });
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 5_001 })] });
    const result = ruleItemLimits(cart, constraints);
    expect(result).toMatchObject({
      ruleId: "item_limits",
      passed: false,
      reason: "unit_price_exceeds_limit",
      observed: 5_001,
      limit: 5_000,
    });
  });

  it("denies when an item's quantity exceeds the limit", () => {
    const constraints = makeConstraints({ items: { maxUnitPriceCents: 5_000, maxQuantity: 5 } });
    const cart = makeCart({ items: [makeItem({ quantity: 6 })] });
    const result = ruleItemLimits(cart, constraints);
    expect(result).toMatchObject({
      ruleId: "item_limits",
      passed: false,
      reason: "quantity_exceeds_limit",
      observed: 6,
      limit: 5,
    });
  });

  it("fails closed when constraints did not parse", () => {
    const cart = makeCart();
    const result = ruleItemLimits(cart, null);
    expect(result).toMatchObject({ ruleId: "item_limits", passed: false, reason: "unparseable_constraints" });
  });
});

describe("ruleTransactionCap", () => {
  it("passes when the cart total is at or under the per-transaction cap", () => {
    const constraints = makeConstraints({ spend: { perTransactionCents: 10_000, perWindowCents: 50_000, window: "P7D", currency: "USD" } });
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 10_000, quantity: 1 })] });
    const result = ruleTransactionCap(cart, constraints);
    expect(result).toMatchObject({ ruleId: "transaction_cap", passed: true });
  });

  it("denies when the cart total exceeds the per-transaction cap", () => {
    const constraints = makeConstraints({ spend: { perTransactionCents: 10_000, perWindowCents: 50_000, window: "P7D", currency: "USD" } });
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 10_001, quantity: 1 })] });
    const result = ruleTransactionCap(cart, constraints);
    expect(result).toMatchObject({
      ruleId: "transaction_cap",
      passed: false,
      reason: "cart_total_exceeds_transaction_cap",
      observed: 10_001,
      limit: 10_000,
    });
  });

  it("fails closed when constraints did not parse", () => {
    const cart = makeCart();
    const result = ruleTransactionCap(cart, null);
    expect(result).toMatchObject({ ruleId: "transaction_cap", passed: false, reason: "unparseable_constraints" });
  });
});
