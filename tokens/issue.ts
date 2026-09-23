// Issues a signed ExecutionToken for one decision over one cart.
//
// docs/spec.md lists request_hash as a token field but only defines
// canonicalization for cart_hash — there is no Request type or
// canonicalizeRequest() yet. Rather than invent a hashing scheme for an
// object this module never sees, requestHash is accepted as an
// already-computed value; the caller (whoever holds the Request) is
// responsible for it.
//
// Pure and deterministic: id/timestamp/nonce all come from the caller, and
// Ed25519 signing itself does not depend on randomness the way ECDSA does,
// so the same inputs always produce the same token.

import { sign, type KeyObject } from "node:crypto";
import type { Cart, Decision, Grant } from "../engine/types.js";
import { canonicalizeTokenBody, cartHash } from "./canonicalize.js";
import type { ExecutionToken } from "./types.js";

const TOKEN_LIFETIME_MS = 120_000;

export function issueToken(
  decision: Decision,
  grant: Grant,
  cart: Cart,
  requestHash: string,
  now: string,
  nonce: string,
  privateKey: KeyObject,
): ExecutionToken {
  const issuedAt = now;
  const expiresAt = new Date(Date.parse(now) + TOKEN_LIFETIME_MS).toISOString();

  const body: Omit<ExecutionToken, "signature"> = {
    grantId: grant.id,
    agentId: grant.agentId,
    requestHash,
    cartHash: cartHash(cart),
    verdict: decision.verdict,
    issuedAt,
    expiresAt,
    nonce,
  };

  const signature = sign(null, Buffer.from(canonicalizeTokenBody(body), "utf8"), privateKey).toString(
    "hex",
  );

  return { ...body, signature };
}
