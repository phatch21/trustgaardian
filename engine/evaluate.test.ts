import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import { makeCart, makeGrant, makeItem } from "./test-helpers.js";

const NOW = "2026-06-01T00:00:00.000Z";

describe("evaluate", () => {
  it("allows a cart that clears every rule", () => {
    const grant = makeGrant();
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 1_000, quantity: 1 })] });

    const decision = evaluate({ id: "decision_1", grant, cart, agentId: grant.agentId, evaluatedAt: NOW });

    expect(decision.verdict).toBe("allow");
    expect(decision.ruleResults).toHaveLength(4);
    expect(decision.ruleResults.every((r) => r.passed)).toBe(true);
  });

  it("denies when the cart total exceeds the per-transaction cap", () => {
    const grant = makeGrant();
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 999_999, quantity: 1 })] });

    const decision = evaluate({ id: "decision_1", grant, cart, agentId: grant.agentId, evaluatedAt: NOW });

    expect(decision.verdict).toBe("deny");
    const transactionCap = decision.ruleResults.find((r) => r.ruleId === "transaction_cap");
    expect(transactionCap).toMatchObject({ passed: false, reason: "cart_total_exceeds_transaction_cap" });
  });

  it("denies and yields an unparseable_constraints reason when the grant's constraints don't parse", () => {
    const grant = makeGrant({ constraints: { spend: "not an object" } });
    const cart = makeCart();

    const decision = evaluate({ id: "decision_1", grant, cart, agentId: grant.agentId, evaluatedAt: NOW });

    expect(decision.verdict).toBe("deny");
    const dependentRuleIds = ["deny_lists", "item_limits", "transaction_cap"];
    for (const ruleId of dependentRuleIds) {
      const result = decision.ruleResults.find((r) => r.ruleId === ruleId);
      expect(result).toMatchObject({ passed: false, reason: "unparseable_constraints" });
    }
  });

  it("still runs every rule after an early one fails, rather than short-circuiting", () => {
    const grant = makeGrant({ agentId: "agent_1" });
    const cart = makeCart();

    // Wrong calling agent fails rule 1, but rules 2-4 must still appear.
    const decision = evaluate({ id: "decision_1", grant, cart, agentId: "agent_2", evaluatedAt: NOW });

    expect(decision.verdict).toBe("deny");
    expect(decision.ruleResults.map((r) => r.ruleId)).toEqual([
      "grant_validity",
      "deny_lists",
      "item_limits",
      "transaction_cap",
    ]);
    const grantValidity = decision.ruleResults.find((r) => r.ruleId === "grant_validity");
    expect(grantValidity).toMatchObject({ passed: false, reason: "agent_mismatch" });
  });
});
