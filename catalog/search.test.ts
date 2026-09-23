import { describe, expect, it } from "vitest";
import { loadCatalog } from "./load.js";
import { search } from "./search.js";

describe("search", () => {
  const catalog = loadCatalog();

  it("matches on a case-insensitive title substring", () => {
    const results = search({ text: "cake topper" }, catalog);
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.title.toLowerCase()).toContain("cake topper");
    }
  });

  it("matches on category, case-insensitively", () => {
    const results = search({ category: "Balloons" }, catalog);
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.category).toBe("balloons");
    }
  });

  it("filters out items over the price ceiling", () => {
    const results = search({ maxPriceCents: 500 }, catalog);
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.unitPriceCents).toBeLessThanOrEqual(500);
    }
  });

  it("combines text, category, and price filters", () => {
    const results = search({ text: "unicorn", category: "tableware", maxPriceCents: 600 }, catalog);
    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item.title.toLowerCase()).toContain("unicorn");
      expect(item.category).toBe("tableware");
      expect(item.unitPriceCents).toBeLessThanOrEqual(600);
    }
  });

  it("returns every item for an empty query", () => {
    expect(search({}, catalog)).toHaveLength(catalog.length);
  });

  it("returns no results when nothing matches", () => {
    expect(search({ text: "definitely-not-a-real-product-xyz" }, catalog)).toEqual([]);
  });
});
