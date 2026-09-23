// Verifies an ExecutionToken against the cart actually presented at
// checkout, and the agent presenting it. Fail closed: every branch below
// returns a distinct rejection reason, nothing throws past this function's
// boundary, and no check is skipped by trusting the input's declared
// TypeScript type — `token` arrives as `unknown` because at this boundary
// it is exactly that: bytes an untrusted agent handed to checkout, not a
// value this codebase built.
//
// Checks run in this order, stopping at the first failure:
//   1. structural validity of the token, and of callingAgentId itself
//   2. signature
//   3. agent binding (token.agentId === callingAgentId)
//   4. not-yet-valid
//   5. expiry
//   6. verdict
//   7. cart hash
//
// A token that fails structural validation can't safely be canonicalized
// for signature verification, so that check has to come first. The agent
// check runs right after the signature, and deliberately not before it: if
// it ran first, a forged token presented by the wrong agent would report
// agent_mismatch, which leaks that the agent_id field itself was
// examinable before the token was proven authentic. Checking the signature
// first means a forged token always fails as bad_signature, regardless of
// what agent_id it happens to carry — nothing about a forged token's
// fields gets treated as meaningful. Presentation-time agent binding is
// what makes a stolen token useless to a second agent (docs/threat-model.md
// T3): the token names the agent it was issued to, and checkout must prove
// the presenter is that agent, not just that the bytes are unforged.
//
// Single-use enforcement (tokens.consumed_at) is not here — that's
// /checkout's job, and it needs a database transaction this module is not
// allowed to have.

import { verify as verifyEd25519, type KeyObject } from "node:crypto";
import type { Cart } from "../engine/types.js";
import { canonicalizeTokenBody, cartHash } from "./canonicalize.js";
import type { ExecutionToken, VerifyResult } from "./types.js";
import { isHex, isNonEmptyString } from "./validate.js";

function parseExecutionToken(raw: unknown): ExecutionToken | null {
  if (typeof raw !== "object" || raw === null) return null;
  const t = raw as Record<string, unknown>;

  if (!isNonEmptyString(t.grantId)) return null;
  if (!isNonEmptyString(t.agentId)) return null;
  if (!isHex(t.requestHash, 32)) return null;
  if (!isHex(t.cartHash, 32)) return null;
  if (t.verdict !== "allow" && t.verdict !== "deny" && t.verdict !== "escalate") return null;
  if (!isNonEmptyString(t.issuedAt) || Number.isNaN(Date.parse(t.issuedAt))) return null;
  if (!isNonEmptyString(t.expiresAt) || Number.isNaN(Date.parse(t.expiresAt))) return null;
  if (!isNonEmptyString(t.nonce)) return null;
  if (!isHex(t.signature, 64)) return null;

  return {
    grantId: t.grantId,
    agentId: t.agentId,
    requestHash: t.requestHash,
    cartHash: t.cartHash,
    verdict: t.verdict,
    issuedAt: t.issuedAt,
    expiresAt: t.expiresAt,
    nonce: t.nonce,
    signature: t.signature,
  };
}

export function verifyToken(
  token: unknown,
  cart: Cart,
  callingAgentId: string,
  now: string,
  publicKey: KeyObject,
): VerifyResult {
  try {
    const parsed = parseExecutionToken(token);
    if (parsed === null) {
      return { ok: false, reason: "malformed_field" };
    }

    if (!isNonEmptyString(callingAgentId)) {
      return { ok: false, reason: "malformed_field" };
    }

    const nowMs = Date.parse(now);
    if (Number.isNaN(nowMs)) {
      return { ok: false, reason: "malformed_field" };
    }

    const { signature, ...body } = parsed;
    const signatureValid = verifyEd25519(
      null,
      Buffer.from(canonicalizeTokenBody(body), "utf8"),
      publicKey,
      Buffer.from(signature, "hex"),
    );
    if (!signatureValid) {
      return { ok: false, reason: "bad_signature" };
    }

    if (parsed.agentId !== callingAgentId) {
      return { ok: false, reason: "agent_mismatch" };
    }

    const issuedAtMs = Date.parse(parsed.issuedAt);
    const expiresAtMs = Date.parse(parsed.expiresAt);

    if (nowMs < issuedAtMs) {
      return { ok: false, reason: "not_yet_valid" };
    }
    if (nowMs > expiresAtMs) {
      return { ok: false, reason: "expired" };
    }

    if (parsed.verdict !== "allow") {
      return { ok: false, reason: "verdict_not_allow" };
    }

    if (cartHash(cart) !== parsed.cartHash) {
      return { ok: false, reason: "cart_hash_mismatch" };
    }

    return { ok: true, token: parsed };
  } catch {
    return { ok: false, reason: "malformed_field" };
  }
}
