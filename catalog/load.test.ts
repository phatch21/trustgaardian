import { describe, expect, it } from "vitest";
import { loadCatalog } from "./load.js";

describe("loadCatalog", () => {
  it("parses every item in the fixture", () => {
    const catalog = loadCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(30);
  });

  it("validates every item's shape", () => {
    const catalog = loadCatalog();

    for (const item of catalog) {
      expect(typeof item.sku).toBe("string");
      expect(item.sku.length).toBeGreaterThan(0);

      expect(typeof item.merchant).toBe("string");
      expect(item.merchant.length).toBeGreaterThan(0);

      expect(typeof item.category).toBe("string");
      expect(item.category.length).toBeGreaterThan(0);

      expect(Number.isInteger(item.unitPriceCents)).toBe(true);
      expect(item.unitPriceCents).toBeGreaterThanOrEqual(0);

      expect(typeof item.title).toBe("string");
      expect(item.title.length).toBeGreaterThan(0);

      expect(typeof item.description).toBe("string");

      expect(["first_party", "third_party"]).toContain(item.sellerType);

      expect(typeof item.rating).toBe("number");
      expect(Number.isFinite(item.rating)).toBe(true);
    }
  });

  it("has unique skus", () => {
    const catalog = loadCatalog();
    const skus = new Set(catalog.map((item) => item.sku));
    expect(skus.size).toBe(catalog.length);
  });

  it("includes several merchants and both seller types", () => {
    const catalog = loadCatalog();
    const merchants = new Set(catalog.map((item) => item.merchant));
    const sellerTypes = new Set(catalog.map((item) => item.sellerType));

    expect(merchants.size).toBeGreaterThanOrEqual(4);
    expect(sellerTypes.has("first_party")).toBe(true);
    expect(sellerTypes.has("third_party")).toBe(true);
  });
});
