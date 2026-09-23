// Canonicalization rules for everything /tokens hashes or signs.
//
// canonicalizeCart(cart):
//   1. Items are sorted by sku ascending, compared as raw UTF-8 bytes
//      (Buffer.compare), never String.localeCompare or the default `<`
//      operator on strings — locale collation is platform- and
//      environment-dependent, which would make the hash non-reproducible
//      across machines for the exact same cart.
//   2. Each item is serialized as sku, merchant, category,
//      unit_price_cents, qty, in that fixed order. No other field order
//      is used anywhere in this file.
//   3. The serialization has no incidental whitespace. Every field is
//      framed as `<byte-length>:<utf8-bytes>` (a netstring), not joined
//      with a delimiter character. This is deliberate: if fields were
//      joined with e.g. "|", a merchant or category string containing
//      "|" could be crafted so two different carts serialize to the same
//      bytes — a hash collision an attacker controls, since merchant and
//      category text ultimately comes from catalog content the agent
//      does not fully trust either (see docs/threat-model.md T2).
//      Length-prefixing removes that possibility regardless of what
//      bytes a field contains.
//   4. unit_price_cents and qty (and total_cents) must be non-negative
//      integers. Money is integer cents everywhere; a float is treated
//      as unparseable input, not rounded or coerced.
//   5. The item count and total_cents are both included in the
//      serialization, ahead of the item list, so truncating the item
//      list (or forging a total that doesn't match the items) changes
//      the hash.
//
// Ties: if two items share a sku, Array.prototype.sort is stable, so
// they keep their original relative order. Carts with duplicate skus are
// unusual and not otherwise handled specially here.
//
// canonicalizeTokenBody(body) uses the same field-framing scheme, applied
// to every ExecutionToken field except the signature itself, in the fixed
// order: grant_id, agent_id, request_hash, cart_hash, verdict, issued_at,
// expires_at, nonce.

import { createHash } from "node:crypto";
import type { Cart } from "../engine/types.js";
import type { ExecutionToken } from "./types.js";
import { isNonNegativeInteger } from "./validate.js";

function field(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function canonicalizeCart(cart: Cart): string {
  if (!isNonNegativeInteger(cart.totalCents)) {
    throw new Error("cart total_cents is not a non-negative integer");
  }

  const items = [...cart.items].sort((a, b) => compareBytes(a.sku, b.sku));

  const itemFields = items.map((item) => {
    if (!isNonNegativeInteger(item.unitPriceCents)) {
      throw new Error(`cart item ${item.sku}: unit_price_cents is not a non-negative integer`);
    }
    if (!isNonNegativeInteger(item.quantity)) {
      throw new Error(`cart item ${item.sku}: qty is not a non-negative integer`);
    }
    return (
      field(item.sku) +
      field(item.merchant) +
      field(item.category) +
      field(String(item.unitPriceCents)) +
      field(String(item.quantity))
    );
  });

  return field(String(items.length)) + field(String(cart.totalCents)) + itemFields.join("");
}

export function cartHash(cart: Cart): string {
  return createHash("sha256").update(canonicalizeCart(cart), "utf8").digest("hex");
}

export function canonicalizeTokenBody(body: Omit<ExecutionToken, "signature">): string {
  return (
    field(body.grantId) +
    field(body.agentId) +
    field(body.requestHash) +
    field(body.cartHash) +
    field(body.verdict) +
    field(body.issuedAt) +
    field(body.expiresAt) +
    field(body.nonce)
  );
}
