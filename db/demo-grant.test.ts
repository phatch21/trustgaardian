import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog/index.js";
import { evaluate } from "../engine/index.js";
import type { Cart } from "../engine/types.js";
import { DEMO_AGENT_ID, makeDemoGrant } from "./demo-grant.js";

const catalog = loadCatalog();

function cartOf(skus: string[]): Cart {
  const items = skus.map((sku) => {
    const listing = catalog.find((item) => item.sku === sku);
    if (!listing) throw new Error(`no catalog listing for ${sku}`);
    return {
      sku: listing.sku,
      merchant: listing.merchant,
      unitPriceCents: listing.unitPriceCents,
      quantity: 1,
      category: listing.category,
    };
  });
  const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  return { id: "cart_1", requestId: "request_1", items, totalCents, createdAt: "2026-06-01T00:00:00.000Z" };
}

function evaluateDemo(cart: Cart) {
  return evaluate({
    id: "decision_1",
    grant: makeDemoGrant(),
    cart,
    agentId: DEMO_AGENT_ID,
    evaluatedAt: "2026-06-01T00:00:00.000Z",
  });
}

describe("demo grant: no third-party sellers", () => {
  it("denies every third_party merchant in the catalog, and no first_party one", () => {
    const thirdParty = [...new Set(catalog.filter((i) => i.sellerType === "third_party").map((i) => i.merchant))];
    const denied = (makeDemoGrant().constraints as { merchants: { deny: string[] } }).merchants.deny;
    expect([...denied].sort()).toEqual([...thirdParty].sort());
  });

  it("denies an in-budget cart containing one third-party item, via deny_lists, naming the merchant", () => {
    const thirdPartyItem = catalog.find((i) => i.sellerType === "third_party" && i.unitPriceCents < 3_000);
    const firstPartyItem = catalog.find((i) => i.sellerType === "first_party" && i.unitPriceCents < 3_000);
    const decision = evaluateDemo(cartOf([firstPartyItem!.sku, thirdPartyItem!.sku]));

    expect(decision.verdict).toBe("deny");
    const denyLists = decision.ruleResults.find((r) => r.ruleId === "deny_lists");
    expect(denyLists).toMatchObject({
      passed: false,
      reason: "merchant_denied",
      observed: thirdPartyItem!.merchant,
    });
    // Only the merchant rule is responsible: the cart is otherwise within limits.
    expect(decision.ruleResults.filter((r) => !r.passed).map((r) => r.ruleId)).toEqual(["deny_lists"]);
  });

  it("still allows an in-budget, all first-party cart", () => {
    const firstPartyItem = catalog.find((i) => i.sellerType === "first_party" && i.unitPriceCents < 3_000);
    expect(evaluateDemo(cartOf([firstPartyItem!.sku])).verdict).toBe("allow");
  });
});
