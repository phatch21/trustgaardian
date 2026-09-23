// Result shape for attemptCheckout. Every rejection reason /tokens can
// return is passed through unchanged, plus four failure modes that belong
// to /checkout itself: the token names a nonce this store has never seen;
// one it has already consumed; the write lock was held by another
// presentation of this or another token (lock_contention); or something
// genuinely unanticipated happened (internal_error) — matching how
// verifyToken never lets an exception escape, attemptCheckout doesn't
// either.

import type { RejectionReason } from "../tokens/types.js";

export type CheckoutRejectionReason =
  | RejectionReason
  | "unknown_nonce"
  | "already_consumed"
  | "lock_contention"
  | "internal_error";

export type CheckoutResult =
  | { ok: true; nonce: string; consumedAt: string }
  | { ok: false; reason: CheckoutRejectionReason };
