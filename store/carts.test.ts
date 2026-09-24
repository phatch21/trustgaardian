import { describe, expect, it } from "vitest";
import { createGrant } from "./grants.js";
import { createCart, getCart } from "./carts.js";
import { createRequest } from "./requests.js";
import { makeCart, makeGrant, makeItem, makeRequest, makeTestDb } from "./test-helpers.js";

describe("createCart / getCart", () => {
  it("round-trips a cart with multiple items", () => {
    const db = makeTestDb();
    createGrant(db, makeGrant());
    createRequest(db, makeRequest());
    const cart = makeCart({ items: [makeItem({ sku: "a" }), makeItem({ sku: "b", quantity: 2 })] });

    createCart(db, cart);
    const result = getCart(db, cart.id);

    expect(result).toEqual(cart);
  });

  it("returns null for an id that was never created", () => {
    const db = makeTestDb();
    expect(getCart(db, "does_not_exist")).toBeNull();
  });
});
