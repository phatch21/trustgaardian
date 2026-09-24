import { describe, expect, it } from "vitest";
import { createCart } from "./carts.js";
import { createDecision, getDecision } from "./decisions.js";
import { createGrant } from "./grants.js";
import { createRequest } from "./requests.js";
import { makeCart, makeDecision, makeGrant, makeRequest, makeTestDb } from "./test-helpers.js";

describe("createDecision / getDecision", () => {
  it("round-trips a decision with its rule breakdown", () => {
    const db = makeTestDb();
    createGrant(db, makeGrant());
    createRequest(db, makeRequest());
    createCart(db, makeCart());
    const decision = makeDecision({
      verdict: "deny",
      ruleResults: [
        { ruleId: "transaction_cap", passed: false, reason: "cart_total_exceeds_transaction_cap", observed: 5_000, limit: 1_000 },
      ],
    });

    createDecision(db, decision);
    const result = getDecision(db, decision.id);

    expect(result).toEqual(decision);
  });

  it("returns null for an id that was never created", () => {
    const db = makeTestDb();
    expect(getDecision(db, "does_not_exist")).toBeNull();
  });
});
