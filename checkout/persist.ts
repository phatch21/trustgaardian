// Persists the tokens-table row at issuance time.
//
// tokens/issue.ts's issueToken() is pure and touches no database — that is
// /tokens' contract ("pure, no I/O, no database"). Nothing in this
// codebase currently calls issueToken() outside of tests, because there is
// no orchestration layer yet that runs /engine, then /tokens, then hands
// the result to an agent. This function is that missing write, ready to be
// called the moment such a call site exists: immediately after
// issueToken() returns, before the token is handed out, call this so
// attemptCheckout can later find it by nonce.
//
// attemptCheckout() (checkout/attempt.ts) never calls this. It only reads
// and updates consumed_at on a row this function already created —
// /checkout does not create token rows.

import type Database from "better-sqlite3";
import type { ExecutionToken } from "../tokens/types.js";

export function persistIssuedToken(db: Database.Database, token: ExecutionToken): void {
  db.prepare(
    `INSERT INTO tokens (nonce, grant_id, agent_id, cart_hash, issued_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(token.nonce, token.grantId, token.agentId, token.cartHash, token.issuedAt, token.expiresAt);
}
