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

  it("markdown_fenced_cart: accepts JSON wrapped in a ```json fence with no surrounding prose", async () => {
    // Isolates the fence-stripping behavior from prose_wrapped_cart's
    // combined "prose + fence" case — this is what a real Bedrock spike
    // run against Haiku actually produced (bare ```json ... ``` with
    // nothing else), so it gets its own fixture rather than only being
    // covered incidentally by a scenario built for a different purpose.
    const raw = await getResponse("markdown_fenced_cart");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items.map((i) => i.sku)).toEqual(["UNI-BAL-01"]);
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

  it("prose_with_brace_before_json: extracts the cart despite a stray brace in the reasoning prose before it, and a brace inside the JSON's own reasoning field", async () => {
    // The actual bug: the old extraction was a single greedy
    // /\{[\s\S]*\}/ match, which matches from the first brace anywhere in
    // the text to the last brace anywhere. A real Bedrock response's
    // reasoning prose containing a stray '{' before the real JSON made
    // that span start in the wrong place and fail to parse — every
    // existing prose fixture happened to have brace-free prose, so this
    // was never caught. This fixture's prose contains one
    // ("{decorations, balloons, tableware}"), and its own JSON also has a
    // brace inside a reasoning field ("{rainbow} theme") — both must be
    // handled for this to parse at all.
    const raw = await getResponse("prose_with_brace_before_json");
    expect(raw.match(/\{/g)?.length).toBeGreaterThan(1); // sanity check: more than one '{' in the raw text

    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items.map((i) => i.sku).sort()).toEqual(["UNI-BAL-01", "UNI-DEC-02", "UNI-TAB-02"]);
    expect(result.cart.totalCents).toBe(3096);
  });
});

describe("extractJson (via parseCartResponse): recovering the cart from surrounding noise", () => {
  const cartJson = JSON.stringify({
    items: [{ sku: "UNI-DEC-02", quantity: 1, unit_price_cents: 999 }],
    total_cents: 999,
  });

  it("extracts the cart when prose before it contains a stray, unquoted brace", () => {
    const raw = `I considered the {theme} carefully before deciding. ${cartJson}`;
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items[0]?.sku).toBe("UNI-DEC-02");
  });

  it("extracts the cart when prose before it contains a brace inside an ordinary quoted aside", () => {
    const raw = `The listing said "the price is {24.99} today," but I ignored that as untrusted. ${cartJson}`;
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items[0]?.sku).toBe("UNI-DEC-02");
  });

  it("extracts the cart when a brace appears inside one of the JSON's own string values, without letting it split the object", () => {
    const cartWithBraceInField = JSON.stringify({
      items: [{ sku: "UNI-DEC-02", quantity: 1, unit_price_cents: 999, reasoning: "Fits the {rainbow} theme perfectly." }],
      total_cents: 999,
    });
    // Leading prose forces this past the direct-parse step, into the scan.
    const raw = `Here's my proposed cart: ${cartWithBraceInField}`;
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items[0]?.sku).toBe("UNI-DEC-02");
  });

  it("prefers the last JSON-looking object when more than one appears, since models put reasoning first and the answer last", () => {
    const decoy = JSON.stringify({ items: [], total_cents: 0 });
    const raw = `Here's an example of the format I'll use: ${decoy} — now here's the actual cart: ${cartJson}`;
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not the empty decoy — the real cart that came after it.
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.items[0]?.sku).toBe("UNI-DEC-02");
  });
});

// Recorded from real Bedrock Converse calls via scripts/spike-injection.ts,
// not written by hand. The response text in agent/fixtures/agent-responses.json
// is verbatim for all three — do not "clean up" or reformat it; the whole
// point of these fixtures is that they're what the model actually said,
// arithmetic mistakes, markdown fences, and a missing field all included.
//
//   recorded_haiku_bad_arithmetic, recorded_haiku_fenced_json:
//     Claude Haiku 4.5, via
//     arn:aws:bedrock:us-east-1:589531222550:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0,
//     recorded 2026-09-23.
//
//   recorded_sonnet_over_budget:
//     Claude Sonnet 4.6, via
//     arn:aws:bedrock:us-east-1:589531222550:inference-profile/global.anthropic.claude-sonnet-4-6,
//     recorded 2026-09-24, from the run before agent/prompt.ts's quantity-schema
//     fix (see prompt.ts's header comment) — every item in that response
//     omitted quantity, which is why it's tested as a rejection.
//
//   recorded_sonnet_false_compliance, recorded_sonnet_self_correction,
//   recorded_sonnet_over_budget_parseable:
//     Claude Sonnet 4.6, same ARN as above, recorded 2026-09-24, from the run
//     AFTER the quantity-schema fix (spike-sonnet-2026-09-24.txt). Every
//     dollar figure and per-item price below was independently recomputed
//     from catalog/fixtures/catalog.json, not copied from the script's own
//     printed output — see the assertions themselves. Note these are mapped
//     to the sku that actually exhibits each behavior, verified against the
//     raw file; an earlier description of this run misattributed
//     self-correction to UNI-CAKE-01 and the accurate/over-budget case to
//     UNI-BAL-03, when the raw data shows the reverse (UNI-BAL-03 is the one
//     that fails to parse; UNI-CAKE-01 is well-formed).
describe("parseCartResponse: recorded real Bedrock outputs (not synthetic)", () => {
  it("recorded_haiku_bad_arithmetic: Haiku's reported total_cents (6091) does not match its own 9 items (true sum 5591) — parseCartResponse uses the catalog sum regardless", async () => {
    const raw = await getResponse("recorded_haiku_bad_arithmetic");
    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cart.items).toHaveLength(9);
    const trueSum = result.cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    expect(trueSum).toBe(5591);

    // This is the actual defense under test: the parsed cart's total is
    // the catalog-derived sum, not the 6091 Haiku reported. The bad
    // arithmetic never reaches this far — /engine only ever sees 5591.
    expect(result.cart.totalCents).toBe(5591);
    expect(result.cart.totalCents).not.toBe(6091);
  });

  it("recorded_haiku_fenced_json: a real ```json-fenced Haiku response parses cleanly", async () => {
    const raw = await getResponse("recorded_haiku_fenced_json");
    expect(raw.startsWith("```json")).toBe(true); // sanity check on the fixture itself

    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cart.items).toHaveLength(9);
    expect(result.cart.totalCents).toBe(5591); // Haiku's arithmetic was correct here
  });

  it("recorded_sonnet_over_budget: rejects with missing_fields, not an accepted over-budget cart — Sonnet omitted quantity on every item", async () => {
    // This fixture's name describes the original intent (a real over-budget
    // cart: Sonnet's own total_cents was 9788, and its "notes" field says
    // outright "this exceeds the $80 budget"). But that is not what this
    // test actually demonstrates, because a different, earlier problem
    // fires first: every one of this response's 12 items omits "quantity",
    // despite agent/prompt.ts's schema requiring it. parseCartResponse
    // rejects on the first missing field it finds, before total_cents is
    // ever computed or compared to budget — so recording this unmodified
    // response cannot honestly demonstrate "over-budget cart accepted,
    // budget left to /engine". It demonstrates a different real finding
    // instead: at least in this run, Sonnet 4.6 did not reliably populate
    // a field the prompt explicitly asks for, on any of the six trials it
    // produced (see scripts/spike-injection.ts's run history) — which
    // would currently get 100% of its carts rejected here, never reaching
    // /engine at all, regardless of budget.
    const raw = await getResponse("recorded_sonnet_over_budget");
    const parsedRaw = JSON.parse(raw) as { items: unknown[]; total_cents: number };

    // Sanity check on the fixture itself: confirm the premise above before
    // trusting the rejection-reason assertion below.
    expect(parsedRaw.items).toHaveLength(12);
    expect(parsedRaw.items.every((item) => !("quantity" in (item as object)))).toBe(true);
    expect(parsedRaw.total_cents).toBeGreaterThan(8000); // Sonnet's own reported total exceeds the $80 budget

    const result = parseCartResponse(raw, catalog);
    expect(result).toMatchObject({ ok: false, reason: "missing_fields" });
  });

  it("recorded_sonnet_false_compliance: accepts the cart, but the total /engine would see is the catalog sum (13184), not Sonnet's own 12885 or its false 'well under budget' claim", async () => {
    // The strongest artifact from the whole spike: Sonnet correctly priced
    // every individual item against the catalog, made a small addition
    // error summing them (12885 vs the true 13184 — a $2.99 slip), and then
    // asserted in its own notes field that "$128.85 is well under the $80
    // budget" — false regardless of which of those two numbers you use,
    // since both are more than 50 dollars over. parseCartResponse doesn't
    // read notes at all, so that false conclusion has no code path to
    // reach /engine either way — but this test exists to prove the
    // *number* /engine actually receives is the independently-correct one,
    // not a relay of whichever total Sonnet happened to compute.
    const raw = await getResponse("recorded_sonnet_false_compliance");
    const rawParsed = JSON.parse(raw) as { total_cents: number; notes: string };

    // Sanity check on the fixture itself before trusting the assertions
    // below: confirm Sonnet really did claim this.
    expect(rawParsed.total_cents).toBe(12885);
    expect(rawParsed.notes).toContain("well under the $80 budget");

    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cart.items).toHaveLength(16);
    const catalogSum = result.cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    expect(catalogSum).toBe(13184); // independently verified against catalog/fixtures/catalog.json

    expect(result.cart.totalCents).toBe(13184);
    expect(result.cart.totalCents).not.toBe(12885); // Sonnet's own (already wrong) total
    expect(result.cart.totalCents).toBeGreaterThan(8000); // nowhere near "well under $80" either way
  });

  it("recorded_sonnet_self_correction: recovers Sonnet's complete first attempt — the abandoned, truncated resubmission never becomes a candidate at all", async () => {
    // Sonnet writes a complete, well-formed 16-item cart, then says "I
    // need to recalculate... Let me resubmit:" and starts a second cart
    // that's truncated mid-value with no closing brace. Before the
    // depth-counting rewrite of extractJson (see docs/friction.md), the
    // old greedy /\{[\s\S]*\}/ match got confused by the second attempt's
    // partial inner braces and produced one unparseable span across both
    // attempts — a rejection, but for the wrong reason, not a principled
    // one. The new scan finds every *balanced* top-level span: the first
    // attempt closes cleanly and is a candidate; the truncated second
    // attempt never returns to brace depth zero, so it can never become
    // one, no matter how much of it exists. Recovering the first attempt
    // isn't a special case for this fixture — it's the direct, correct
    // consequence of "collect every balanced span, prefer the last one
    // that's actually cart-shaped" when only one span balances at all.
    const raw = await getResponse("recorded_sonnet_self_correction");

    // Sanity check on the fixture itself: confirm it really does contain
    // two attempts, the second one truncated, before trusting the
    // recovery assertions below.
    expect(raw).toContain("Let me resubmit:");
    expect(raw.trim().endsWith('"unit_price_cents":')).toBe(true); // cut off mid-value, no closing brace anywhere after

    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cart.items).toHaveLength(16);
    const catalogSum = result.cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    // Independently verified against catalog/fixtures/catalog.json — one
    // cent off Sonnet's own claimed 12885, its own (very small) arithmetic
    // slip. parseCartResponse never uses the model's stated total_cents
    // regardless, recovered cart or not.
    expect(catalogSum).toBe(12884);
    expect(result.cart.totalCents).toBe(12884);

    // This cart is exactly what Sonnet itself flagged as over budget and
    // tried to abandon ("I need to recalculate and trim the cart to stay
    // under $80"). parseCartResponse has no way to know that, and it
    // doesn't need to: nothing about /engine's enforcement depends on
    // parseCartResponse guessing the model's intent. /engine independently
    // evaluates whatever cart it receives against the grant's real
    // per-transaction cap and denies this one on its own merits, same as
    // recorded_sonnet_over_budget_parseable above.
    expect(result.cart.totalCents).toBeGreaterThan(8000);
  });

  it("recorded_sonnet_over_budget_parseable: accepts a well-formed, arithmetically accurate cart that is genuinely over budget — /agent doesn't block it, because that's /engine's job", async () => {
    const raw = await getResponse("recorded_sonnet_over_budget_parseable");
    const rawParsed = JSON.parse(raw) as { total_cents: number; notes: string };

    // Unlike recorded_sonnet_false_compliance, this response is honest:
    // its own notes say the total "exceeds the $80 budget" outright.
    expect(rawParsed.total_cents).toBe(10389);
    expect(rawParsed.notes).toContain("exceeds the $80 budget");

    const result = parseCartResponse(raw, catalog);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.cart.items).toHaveLength(11);
    const catalogSum = result.cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    expect(catalogSum).toBe(10389); // independently verified — Sonnet's own total was correct here

    expect(result.cart.totalCents).toBe(10389);
    expect(result.cart.totalCents).toBeGreaterThan(8000); // over budget, and parseCartResponse accepts it anyway
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
