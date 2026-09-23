// Structural validation of a Grant's constraints. This is not I/O — the
// caller has already deserialized constraints_json before calling into
// /engine — but it is the trust boundary: constraints arrive as `unknown`
// and any field that doesn't match the expected shape makes the whole
// object untrustworthy. Fail closed: return null, never throw, never
// coerce a bad value into something plausible.

import { isNonEmptyString, isNonNegativeInteger, isStringArray } from "./validate.js";
import type { GrantConstraints } from "./types.js";

export function parseConstraints(raw: unknown): GrantConstraints | null {
  if (typeof raw !== "object" || raw === null) return null;
  const root = raw as Record<string, unknown>;

  const spend = root.spend;
  if (typeof spend !== "object" || spend === null) return null;
  const s = spend as Record<string, unknown>;
  if (
    !isNonNegativeInteger(s.perTransactionCents) ||
    !isNonNegativeInteger(s.perWindowCents) ||
    !isNonEmptyString(s.window) ||
    !isNonEmptyString(s.currency)
  ) {
    return null;
  }

  const merchants = root.merchants;
  if (typeof merchants !== "object" || merchants === null) return null;
  const m = merchants as Record<string, unknown>;
  if (!isStringArray(m.allow) || !isStringArray(m.deny)) return null;

  const categories = root.categories;
  if (typeof categories !== "object" || categories === null) return null;
  const c = categories as Record<string, unknown>;
  if (!isStringArray(c.allow) || !isStringArray(c.deny)) return null;

  const frequency = root.frequency;
  if (typeof frequency !== "object" || frequency === null) return null;
  const f = frequency as Record<string, unknown>;
  if (!isNonNegativeInteger(f.maxPurchases) || !isNonEmptyString(f.window)) return null;

  const items = root.items;
  if (typeof items !== "object" || items === null) return null;
  const i = items as Record<string, unknown>;
  if (!isNonNegativeInteger(i.maxUnitPriceCents) || !isNonNegativeInteger(i.maxQuantity)) {
    return null;
  }

  const escalation = root.escalation;
  if (typeof escalation !== "object" || escalation === null) return null;
  const e = escalation as Record<string, unknown>;
  if (!isNonNegativeInteger(e.requireApprovalAboveCents) || !isStringArray(e.autoDenyOn)) {
    return null;
  }

  return {
    spend: {
      perTransactionCents: s.perTransactionCents as number,
      perWindowCents: s.perWindowCents as number,
      window: s.window as string,
      currency: s.currency as string,
    },
    merchants: { allow: m.allow as string[], deny: m.deny as string[] },
    categories: { allow: c.allow as string[], deny: c.deny as string[] },
    frequency: { maxPurchases: f.maxPurchases as number, window: f.window as string },
    items: {
      maxUnitPriceCents: i.maxUnitPriceCents as number,
      maxQuantity: i.maxQuantity as number,
    },
    escalation: {
      requireApprovalAboveCents: e.requireApprovalAboveCents as number,
      autoDenyOn: e.autoDenyOn as string[],
    },
  };
}
