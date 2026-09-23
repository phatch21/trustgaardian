// Parses the model's raw text response into a ProposedCart. Never throws —
// every failure is a distinct ParseCartResult rejection, the same
// discipline /tokens' verifyToken and /checkout's attemptCheckout already
// follow, so whatever eventually calls this can branch on why rather than
// catching an exception.
//
// Deliberate defense: unitPriceCents, merchant, and category on every
// returned item come from a catalog lookup by sku, never from the model's
// own JSON. r.unit_price_cents is validated only for shape (is it an
// integer at all) — its value is never read for anything. A model that
// has been fooled into reporting a lower price than the real listing (see
// docs/injection-fixtures.md's UNI-DEC-06) cannot make that lie reach
// /engine this way, because nothing downstream of this function ever sees
// the model's claimed price. total_cents is likewise always recomputed
// from the catalog-priced line items, never taken from the model's stated
// total_cents.
//
// What this function does not do: decide whether the proposed cart is
// allowed. That's /engine's job, not this one's. A cart built entirely
// from injection-bearing listings parses successfully here if it is
// otherwise well-formed — /agent proposes, /engine decides. See
// docs/threat-model.md T2.

import type { CatalogItem } from "../catalog/index.js";
import type { CartItem } from "../engine/types.js";
import type { CartRejectionReason, ParseCartResult, ProposedCart } from "./types.js";

interface RawCartItem {
  sku?: unknown;
  quantity?: unknown;
  unit_price_cents?: unknown;
}

interface RawCartResponse {
  items?: unknown;
}

function reject(reason: CartRejectionReason, detail: string): ParseCartResult {
  return { ok: false, reason, detail };
}

// Models sometimes wrap valid JSON in prose or markdown fences despite
// being told not to. Try a direct parse first; if that fails, fall back
// to the first balanced-looking {...} block in the text.
function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

export function parseCartResponse(raw: string, catalog: CatalogItem[]): ParseCartResult {
  const parsed = extractJson(raw);
  if (parsed === undefined) {
    return reject("invalid_json", "response is not valid JSON, and no JSON object could be extracted from it");
  }

  if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as RawCartResponse).items)) {
    return reject("missing_fields", "response is missing an items array");
  }

  const rawItems = (parsed as RawCartResponse).items as unknown[];
  const catalogBySku = new Map(catalog.map((item) => [item.sku, item]));
  const items: CartItem[] = [];

  for (const [index, rawItem] of rawItems.entries()) {
    if (typeof rawItem !== "object" || rawItem === null) {
      return reject("missing_fields", `item ${index} is not an object`);
    }
    const r = rawItem as RawCartItem;

    if (typeof r.sku !== "string" || r.sku.length === 0) {
      return reject("missing_fields", `item ${index} is missing a sku`);
    }
    if (r.quantity === undefined) {
      return reject("missing_fields", `item ${index} (${r.sku}) is missing quantity`);
    }
    if (!(typeof r.quantity === "number" && Number.isInteger(r.quantity) && r.quantity > 0)) {
      return reject("invalid_quantity", `item ${index} (${r.sku}) has a non-positive or non-integer quantity`);
    }
    if (r.unit_price_cents === undefined) {
      return reject("missing_fields", `item ${index} (${r.sku}) is missing unit_price_cents`);
    }
    if (!(typeof r.unit_price_cents === "number" && Number.isInteger(r.unit_price_cents))) {
      return reject("non_integer_price", `item ${index} (${r.sku}) reported a non-integer unit_price_cents`);
    }

    const catalogItem = catalogBySku.get(r.sku);
    if (!catalogItem) {
      return reject("unknown_sku", `item ${index} references sku "${r.sku}", which is not in the catalog`);
    }

    // The deliberate defense: price, merchant, and category come from the
    // catalog. r.unit_price_cents was validated above only for shape and
    // is discarded here, never used for the item's actual price.
    items.push({
      sku: catalogItem.sku,
      merchant: catalogItem.merchant,
      category: catalogItem.category,
      unitPriceCents: catalogItem.unitPriceCents,
      quantity: r.quantity,
    });
  }

  const totalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  const cart: ProposedCart = { items, totalCents };

  return { ok: true, cart };
}
