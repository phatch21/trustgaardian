// Loads catalog/fixtures/catalog.json and validates its shape.
//
// Validation here checks structure only — every field is the right type,
// present, non-empty where that's meaningful. It never inspects, rewrites,
// strips, or flags the *content* of title or description. That is
// deliberate, not an oversight: six items in the fixture carry planted
// prompt-injection payloads (docs/injection-fixtures.md), and the point of
// this project's actual defense (docs/threat-model.md T2) is that hostile
// listing text flows through untouched and fails downstream, at the
// deterministic policy engine, rather than being caught by upstream
// filtering. Adding a sanitizer here would quietly undermine the thing
// this fixture set exists to demonstrate.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogItem, SellerType } from "./types.js";

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "catalog.json");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSellerType(value: unknown): value is SellerType {
  return value === "first_party" || value === "third_party";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseItem(raw: unknown, index: number): CatalogItem {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`catalog fixture item ${index}: not an object`);
  }
  const r = raw as Record<string, unknown>;
  const label = isNonEmptyString(r.sku) ? r.sku : `index ${index}`;

  if (!isNonEmptyString(r.sku)) {
    throw new Error(`catalog fixture item (${label}): missing or invalid sku`);
  }
  if (!isNonEmptyString(r.merchant)) {
    throw new Error(`catalog fixture item ${label}: missing or invalid merchant`);
  }
  if (!isNonEmptyString(r.category)) {
    throw new Error(`catalog fixture item ${label}: missing or invalid category`);
  }
  if (!isNonNegativeInteger(r.unit_price_cents)) {
    throw new Error(`catalog fixture item ${label}: unit_price_cents must be a non-negative integer`);
  }
  // title/description content is intentionally unchecked beyond "is a
  // string" — see the file header comment.
  if (typeof r.title !== "string" || r.title.length === 0) {
    throw new Error(`catalog fixture item ${label}: missing or invalid title`);
  }
  if (typeof r.description !== "string") {
    throw new Error(`catalog fixture item ${label}: missing or invalid description`);
  }
  if (!isSellerType(r.seller_type)) {
    throw new Error(`catalog fixture item ${label}: seller_type must be "first_party" or "third_party"`);
  }
  if (!isFiniteNumber(r.rating)) {
    throw new Error(`catalog fixture item ${label}: rating must be a number`);
  }

  return {
    sku: r.sku,
    merchant: r.merchant,
    category: r.category,
    unitPriceCents: r.unit_price_cents,
    title: r.title,
    description: r.description,
    sellerType: r.seller_type,
    rating: r.rating,
  };
}

export function loadCatalog(): CatalogItem[] {
  const raw: unknown = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error("catalog fixture must be a JSON array");
  }
  return raw.map((item, index) => parseItem(item, index));
}
