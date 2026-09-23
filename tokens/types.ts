// ExecutionToken and the verification result shape. Imports only types from
// engine/types.ts — /tokens does not depend on engine's runtime code.

import type { Verdict } from "../engine/types.js";

export interface ExecutionToken {
  grantId: string;
  agentId: string;
  requestHash: string;
  cartHash: string;
  verdict: Verdict;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  // Ed25519 signature, hex-encoded, over canonicalizeTokenBody() of every
  // other field.
  signature: string;
}

// Every rejection path gets its own code so a caller can't collapse
// "expired" and "forged" into the same branch by accident.
export type RejectionReason =
  | "malformed_field"
  | "bad_signature"
  | "agent_mismatch"
  | "expired"
  | "not_yet_valid"
  | "verdict_not_allow"
  | "cart_hash_mismatch";

export type VerifyResult =
  | { ok: true; token: ExecutionToken }
  | { ok: false; reason: RejectionReason };
