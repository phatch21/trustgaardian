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
// being told not to, and real reasoning prose can itself contain a stray
// '{' or '}' — a parenthetical, a set-like aside, anything — well before
// the actual cart JSON begins. A single greedy /\{[\s\S]*\}/ match (the
// previous approach) matches from the first brace anywhere in the text to
// the last brace anywhere, which breaks the moment prose contains one: it
// spans from that stray brace straight through to the real JSON's closing
// brace, producing an unparseable blob. See docs/friction.md.
//
// Extraction happens in three steps, most specific signal first:
//   1. The raw text is valid JSON as-is — the model followed instructions
//      exactly.
//   2. A markdown-fenced block (```json ... ``` or ``` ... ```), if
//      present, is the model's own explicit delimiter for its answer —
//      tried before the general scan because it's unambiguous when it's
//      there.
//   3. A general scan: walk the string tracking brace depth, treating
//      text inside JSON string literals (respecting \" escapes) as inert
//      so a brace inside a "reasoning" field's value never affects depth.
//      This collects every *balanced top-level* {...} span — nested
//      braces never start a new span, only depth returning to zero closes
//      one. Candidates are tried last-to-first (models put reasoning
//      before the answer, not after) and the first one that parses into
//      an object with an items array wins.
//
// Every step here only decides *which substring is the candidate JSON* —
// none of it decides whether that JSON is a valid cart. That's still
// entirely parseCartResponse's job, below, untouched.

function looksLikeCart(value: unknown): boolean {
  return typeof value === "object" && value !== null && Array.isArray((value as { items?: unknown }).items);
}

// Every balanced top-level {...} span in `text`, in the order they
// appear. A "top-level" span is one that starts while brace depth is 0;
// anything nested inside it (an item object inside "items", say) is part
// of that span, not a separate candidate of its own. Braces inside JSON
// string values (respecting \" escapes) never affect depth, so a
// reasoning field like "fits the {theme} perfectly" can't fool this into
// mis-splitting the object it's inside — and by the same mechanism, an
// ordinary English quotation containing a brace in the surrounding prose
// is equally inert, since it's balanced open/close quotes either way.
function findBalancedObjects(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          spans.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  return spans;
}

function extractFencedJson(text: string): string | undefined {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim();
}

function tryParseCart(candidate: string): unknown {
  try {
    const parsed: unknown = JSON.parse(candidate);
    return looksLikeCart(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // fall through to the recovery steps below
  }

  const fenced = extractFencedJson(raw);
  if (fenced !== undefined) {
    const fromFence = tryParseCart(fenced);
    if (fromFence !== undefined) return fromFence;
  }

  const candidates = findBalancedObjects(raw);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i];
    if (candidate === undefined) continue;
    const parsed = tryParseCart(candidate);
    if (parsed !== undefined) return parsed;
  }

  return undefined;
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
