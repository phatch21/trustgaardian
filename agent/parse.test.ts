import { describe, expect, it } from "vitest";
import { loadCatalog } from "../catalog/index.js";
import { FixtureAgentClient } from "./fixture-client.js";
import { parseCartResponse } from "./parse.js";
import { buildPrompt } from "./prompt.js";

const REQUEST = "find unicorn birthday party supplies under $80, no third-party sellers";
const catalog = loadCatalog();
const prompt = buildPrompt(REQUEST, catalog);

async function getResponse(scenario: string): Promise<string> {
  return new FixtureAgentClient(scenario).complete(prompt);
}

describe("parseCartResponse, driven by FixtureAgentClient", () => {
  it("clean_cart_match: accepts a well-formed cart of real catalog skus", async () => {
    const raw = await getResponse("clean_cart_match");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items.length).toBe(3);
    for (const item of result.cart.items) {
      expect(catalog.some((c) => c.sku === item.sku)).toBe(true);
    }
    expect(result.cart.totalCents).toBe(
      result.cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0),
    );
  });

  it("injection_item_included: accepts a cart containing an injection-bearing item without filtering it", async () => {
    const raw = await getResponse("injection_item_included");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // /agent proposes, /engine decides — this module has no business
    // rejecting a cart just because one of its items carries a planted
    // injection payload in its (unread-by-the-engine) description.
    expect(result.cart.items.some((item) => item.sku === "UNI-DEC-01")).toBe(true);
  });

  it("price_override_attempt: accepts the cart but neutralizes the claimed lower price via catalog lookup", async () => {
    const raw = await getResponse("price_override_attempt");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const item = result.cart.items.find((i) => i.sku === "UNI-DEC-06");
    const realPrice = catalog.find((c) => c.sku === "UNI-DEC-06")?.unitPriceCents;

    expect(item).toBeDefined();
    expect(realPrice).toBe(2499);
    expect(item?.unitPriceCents).toBe(realPrice);
    expect(item?.unitPriceCents).not.toBe(499); // the model's claimed lower price
    expect(result.cart.totalCents).toBe(2499);
  });

  it("malformed_json: rejects with invalid_json", async () => {
    const raw = await getResponse("malformed_json");
    const result = parseCartResponse(raw, catalog);
    expect(result).toMatchObject({ ok: false, reason: "invalid_json" });
  });

  it("unknown_sku_referenced: rejects with unknown_sku", async () => {
    const raw = await getResponse("unknown_sku_referenced");
    const result = parseCartResponse(raw, catalog);
    expect(result).toMatchObject({ ok: false, reason: "unknown_sku" });
  });

  it("prose_wrapped_cart: accepts a valid cart despite prose and markdown fences around it", async () => {
    const raw = await getResponse("prose_wrapped_cart");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items.map((i) => i.sku).sort()).toEqual(["UNI-CAKE-02", "UNI-FAV-02"]);
  });

  it("missing_fields: rejects when an item is missing a required field", async () => {
    const raw = await getResponse("missing_fields");
    const result = parseCartResponse(raw, catalog);
    expect(result).toMatchObject({ ok: false, reason: "missing_fields" });
  });

  it("invalid_quantity: rejects a zero quantity", async () => {
    const raw = await getResponse("invalid_quantity");
    const result = parseCartResponse(raw, catalog);
    expect(result).toMatchObject({ ok: false, reason: "invalid_quantity" });
  });

  it("non_integer_price: rejects when unit_price_cents is not an integer", async () => {
    const raw = await getResponse("non_integer_price");
    const result = parseCartResponse(raw, catalog);
    expect(result).toMatchObject({ ok: false, reason: "non_integer_price" });
  });
});

describe("parseCartResponse: merchant and category also come from the catalog", () => {
  it("never trusts merchant or category fields that aren't even in the model's schema", async () => {
    // The model's output schema (agent/prompt.ts) doesn't ask for merchant
    // or category at all — proving they can only have come from the
    // catalog lookup, not from anything the model said.
    const raw = await getResponse("clean_cart_match");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const item of result.cart.items) {
      const catalogItem = catalog.find((c) => c.sku === item.sku);
      expect(item.merchant).toBe(catalogItem?.merchant);
      expect(item.category).toBe(catalogItem?.category);
    }
  });
});
