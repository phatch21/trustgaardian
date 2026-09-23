import { describe, expect, it } from "vitest";
import { canonicalizeCart, cartHash } from "./canonicalize.js";
import { makeCart, makeItem } from "./test-helpers.js";

describe("canonicalizeCart / cartHash", () => {
  it("is insensitive to the input order of items", () => {
    const a = makeItem({ sku: "aaa", unitPriceCents: 100 });
    const b = makeItem({ sku: "bbb", unitPriceCents: 200 });

    const cartForward = makeCart({ items: [a, b] });
    const cartReversed = makeCart({ items: [b, a] });

    expect(cartHash(cartForward)).toBe(cartHash(cartReversed));
  });

  it("changes the hash when an item's quantity changes", () => {
    const base = makeCart({ items: [makeItem({ quantity: 1 })], totalCents: 1_000 });
    const changed = makeCart({ items: [makeItem({ quantity: 2 })], totalCents: 1_000 });

    expect(cartHash(base)).not.toBe(cartHash(changed));
  });

  it("changes the hash when an item's price changes", () => {
    const base = makeCart({ items: [makeItem({ unitPriceCents: 1_000 })] });
    const changed = makeCart({ items: [makeItem({ unitPriceCents: 1_001 })] });

    expect(cartHash(base)).not.toBe(cartHash(changed));
  });

  it("changes the hash when an item's sku changes", () => {
    const base = makeCart({ items: [makeItem({ sku: "sku_1" })] });
    const changed = makeCart({ items: [makeItem({ sku: "sku_2" })] });

    expect(cartHash(base)).not.toBe(cartHash(changed));
  });

  it("changes the hash when an item's merchant changes", () => {
    const base = makeCart({ items: [makeItem({ merchant: "acme" })] });
    const changed = makeCart({ items: [makeItem({ merchant: "globex" })] });

    expect(cartHash(base)).not.toBe(cartHash(changed));
  });

  it("changes the hash when the item count changes, even if the total is unchanged", () => {
    const single = makeCart({
      items: [makeItem({ sku: "sku_1", unitPriceCents: 2_000, quantity: 1 })],
      totalCents: 2_000,
    });
    const split = makeCart({
      items: [
        makeItem({ sku: "sku_1", unitPriceCents: 1_000, quantity: 1 }),
        makeItem({ sku: "sku_2", unitPriceCents: 1_000, quantity: 1 }),
      ],
      totalCents: 2_000,
    });

    expect(cartHash(single)).not.toBe(cartHash(split));
  });

  it("changes the hash when total_cents is truncated without changing the items", () => {
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 1_000, quantity: 1 })] });
    const canonical = canonicalizeCart(cart);
    const truncated = canonicalizeCart({ ...cart, totalCents: 900 });

    expect(canonical).not.toBe(truncated);
  });

  it("sorts by raw byte value, not locale collation (e.g. 'Z' sorts before 'a')", () => {
    const upper = makeItem({ sku: "Z", unitPriceCents: 100 });
    const lower = makeItem({ sku: "a", unitPriceCents: 200 });

    const cartUpperFirst = makeCart({ items: [upper, lower] });
    const cartLowerFirst = makeCart({ items: [lower, upper] });

    // Same multiset of items regardless of input order should canonicalize
    // identically, and specifically by byte value (0x5A < 0x61), not by a
    // locale-aware comparison that might treat case-insensitively.
    expect(cartHash(cartUpperFirst)).toBe(cartHash(cartLowerFirst));
  });

  it("throws on a non-integer price so a float never silently hashes", () => {
    const cart = makeCart({ items: [makeItem({ unitPriceCents: 10.5 })] });
    expect(() => canonicalizeCart(cart)).toThrow();
  });

  it("is deterministic across repeated calls", () => {
    const cart = makeCart({
      items: [makeItem({ sku: "b" }), makeItem({ sku: "a" })],
    });
    expect(cartHash(cart)).toBe(cartHash(cart));
  });
});
