// Naive in-memory search over a loaded catalog. This is a shopping
// convenience for whatever assembles a cart (eventually /agent) — it is
// not, and must never become, the security boundary. A search result
// (however it was reached, including one steered by injected listing
// text) still has to pass /engine's rules before anything is approved.
// See docs/threat-model.md T2.

import type { CatalogItem } from "./types.js";

export interface SearchQuery {
  text?: string;
  category?: string;
  maxPriceCents?: number;
}

export function search(query: SearchQuery, catalog: CatalogItem[]): CatalogItem[] {
  const text = query.text?.trim().toLowerCase();
  const category = query.category?.trim().toLowerCase();

  return catalog.filter((item) => {
    if (text && !item.title.toLowerCase().includes(text)) {
      return false;
    }
    if (category && item.category.toLowerCase() !== category) {
      return false;
    }
    if (query.maxPriceCents !== undefined && item.unitPriceCents > query.maxPriceCents) {
      return false;
    }
    return true;
  });
}
