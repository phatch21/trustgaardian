// The mock merchant-side checkout verifier and the enforcement point for
// single-use tokens (docs/threat-model.md T3). This module imports
// verification from /tokens and logging from /audit; it never reimplements
// either.

import type { KeyObject } from "node:crypto";
import Database from "better-sqlite3";
import { appendEntry } from "../audit/index.js";
import type { Cart } from "../engine/types.js";
import { verifyToken } from "../tokens/index.js";
import type { CheckoutResult } from "./types.js";

interface TokensRow {
  consumed_at: string | null;
}

function isLockContentionError(error: unknown): boolean {
  return error instanceof Database.SqliteError && error.code.startsWith("SQLITE_BUSY");
}

export function attemptCheckout(
  db: Database.Database,
  token: unknown,
  cart: Cart,
  callingAgentId: string,
  now: string,
  publicKey: KeyObject,
): CheckoutResult {
  try {
    // Before verification even runs, so an attacker's failed attempt
    // still leaves a trace — nothing below this line is a precondition
    // for the attempt itself having happened. checkout_attempted and
    // checkout_result are each their own independently-committed
    // appendEntry transaction, not nested inside the verify/consume
    // transaction below, specifically so a rejection there can never take
    // an already-written or about-to-be-written audit entry down with it.
    appendEntry(db, callingAgentId, "checkout_attempted", { cartId: cart.id, callingAgentId }, now);

    // verifyToken and the tokens-table read+write share one transaction,
    // opened with an immediate (not deferred) write lock. That lock is
    // what makes two concurrent presentations of one token impossible
    // rather than merely unlikely: SQLite grants the write lock to at
    // most one connection, and grants it here — before the SELECT runs,
    // not after. A second presentation attempting this same thing while
    // this one is in flight can't even begin: it fails with SQLITE_BUSY
    // (caught below, reported as lock_contention) until this transaction
    // commits, at which point it sees this one's consumed_at write and
    // correctly reports already_consumed. Without .immediate(), two
    // connections could both read consumed_at = NULL before either had
    // written it — the check-then-act race this closes.
    const attempt = db.transaction((): CheckoutResult => {
      const verifyResult = verifyToken(token, cart, callingAgentId, now, publicKey);
      if (!verifyResult.ok) {
        // Record the rejection reason and abort: nothing below this
        // point runs, and since nothing has been written yet, there's
        // nothing to roll back — the transaction simply commits no
        // changes.
        return { ok: false, reason: verifyResult.reason };
      }

      const { nonce } = verifyResult.token;
      const row = db.prepare("SELECT consumed_at FROM tokens WHERE nonce = ?").get(nonce) as
        | TokensRow
        | undefined;

      if (row === undefined) {
        return { ok: false, reason: "unknown_nonce" };
      }
      if (row.consumed_at !== null) {
        return { ok: false, reason: "already_consumed" };
      }

      db.prepare("UPDATE tokens SET consumed_at = ? WHERE nonce = ?").run(now, nonce);
      return { ok: true, nonce, consumedAt: now };
    });

    const result = attempt.immediate();

    // After verification and (if applicable) consumption, whatever the
    // outcome. This runs on every path that reaches here, including
    // every rejection reason.
    appendEntry(db, callingAgentId, "checkout_result", result, now);

    return result;
  } catch (error) {
    // Every other failure in this codebase is a discriminated result, not
    // an exception — verifyToken never lets one escape, and neither does
    // this. SQLITE_BUSY (the write lock held by a concurrent presentation)
    // gets its own specific, expected reason; anything else genuinely
    // unanticipated gets a distinct generic one, so a bug here surfaces as
    // a reason code a caller can branch on, not a crash.
    const reason: "lock_contention" | "internal_error" = isLockContentionError(error)
      ? "lock_contention"
      : "internal_error";
    const result: CheckoutResult = { ok: false, reason };

    // Best-effort: if the database itself is what's unavailable — the
    // same lock contention that just failed us, or something worse — this
    // second write can fail too, for the same reason. The caller always
    // gets a clean result either way; that a specific attempt's own audit
    // trail couldn't be written is an inherent limit of a single SQLite
    // writer, not something retrying the write here can fix.
    try {
      appendEntry(db, callingAgentId, "checkout_result", result, now);
    } catch {
      // Swallowed — see comment above.
    }

    return result;
  }
}
