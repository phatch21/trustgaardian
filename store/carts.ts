// SQL for the carts table.

import type Database from "better-sqlite3";
import type { Cart } from "../engine/types.js";

interface CartRow {
  id: string;
  request_id: string;
  items_json: string;
  total_cents: number;
  created_at: string;
}

function rowToCart(row: CartRow): Cart {
  return {
    id: row.id,
    requestId: row.request_id,
    items: JSON.parse(row.items_json),
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

export function createCart(db: Database.Database, cart: Cart): void {
  db.prepare(
    `INSERT INTO carts (id, request_id, items_json, total_cents, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(cart.id, cart.requestId, JSON.stringify(cart.items), cart.totalCents, cart.createdAt);
}

export function getCart(db: Database.Database, id: string): Cart | null {
  const row = db.prepare("SELECT * FROM carts WHERE id = ?").get(id) as CartRow | undefined;
  return row === undefined ? null : rowToCart(row);
}
