// The three demo affordances from docs/demo-script.md, each attacking the
// system it's paired with using the real /checkout and /audit code — none
// of this fakes an outcome. The one exception is tamper-audit's raw SQL:
// corrupting an audit row on purpose is not something /audit's real API
// should expose next to appendEntry and verifyChain, so that one UPDATE
// statement lives here instead, clearly marked as a demo control rather
// than folded into the production module surface.

import type Database from "better-sqlite3";
import { verifyChain } from "../audit/index.js";
import type { VerifyChainResult } from "../audit/types.js";
import { attemptCheckout } from "../checkout/index.js";
import { DEMO_AGENT_ID, DEMO_IMPOSTOR_AGENT_ID } from "../db/demo-grant.js";
import type { Cart } from "../engine/types.js";
import { getCart } from "../store/index.js";
import type { AppContext } from "./context.js";
import type { DemoCheckoutResult, TamperAuditResult } from "./types.js";

// Bumps the first item's quantity by one, producing a cart whose hash no
// longer matches the one the token was signed over — docs/threat-model.md
// T1, "cart substitution after approval."
function tamperCart(cart: Cart): Cart {
  return {
    ...cart,
    items: cart.items.map((item, index) => (index === 0 ? { ...item, quantity: item.quantity + 1 } : item)),
  };
}

export function handleTamperCartCheckout(ctx: AppContext, cartId: string, token: unknown): DemoCheckoutResult {
  const cart = getCart(ctx.db, cartId);
  if (cart === null) {
    return { ok: false, reason: "cart_not_found" };
  }
  const now = new Date().toISOString();
  return attemptCheckout(ctx.db, token, tamperCart(cart), DEMO_AGENT_ID, now, ctx.publicKey);
}

export function handleAgentMismatchCheckout(ctx: AppContext, cartId: string, token: unknown): DemoCheckoutResult {
  const cart = getCart(ctx.db, cartId);
  if (cart === null) {
    return { ok: false, reason: "cart_not_found" };
  }
  const now = new Date().toISOString();
  return attemptCheckout(ctx.db, token, cart, DEMO_IMPOSTOR_AGENT_ID, now, ctx.publicKey);
}

// Corrupts one audit row's payload_hash directly, bypassing appendEntry
// entirely — the point is to simulate an attacker editing the database
// after the fact, which is exactly what verifyChain's hash_mismatch check
// exists to catch (docs/spec.md's "Verifier semantics").
function corruptAuditEntry(db: Database.Database, seq: number): boolean {
  const info = db.prepare("UPDATE audit SET payload_hash = ? WHERE seq = ?").run("f".repeat(64), seq);
  return info.changes > 0;
}

export function handleTamperAudit(ctx: AppContext, seq: number): TamperAuditResult {
  const changed = corruptAuditEntry(ctx.db, seq);
  if (!changed) {
    return { ok: false, error: `no audit entry with seq ${seq}` };
  }
  return { ok: true, seq };
}

export function handleVerifyChain(ctx: AppContext): VerifyChainResult {
  return verifyChain(ctx.db);
}
