// The single orchestration entry point: given a grant id, an agent id, and
// a raw utterance, wires every module into one request -> token flow. This
// file sequences and persists; it never re-implements policy. /engine still
// renders the verdict, /tokens still signs, /checkout still verifies at
// presentation time — this is the only place that calls all of them in
// order and appends the audit trail in between.
//
// The clock: this function reads `now` once, at the top (the caller's
// supplied value, or the real clock if none was given), and threads that
// single value through every step — the grant validity check inside
// evaluate(), the decision's evaluatedAt, the token's issuedAt, and every
// audit entry's timestamp. Nothing downstream of this function calls
// Date.now() or `new Date()` itself. That is what "the orchestrator
// supplies the clock" (engine/evaluate.ts) means in practice: the agent's
// response can influence which items end up in the cart, never what time
// the engine believes it is.
//
// Ids (request, cart, decision, nonce) are generated here via
// node:crypto's randomUUID — this module is the I/O boundary, so unlike
// /engine or /tokens it's allowed a source of randomness the pure modules
// aren't.
//
// requestHash: tokens/issue.ts accepts requestHash as an already-computed
// value because there is no canonicalizeRequest() yet (see its header
// comment). This module computes it as audit/hash.ts's payloadHash() over
// the persisted Request object — a pure, already-existing hashing utility,
// reused rather than inventing a second canonicalization scheme for an
// object /tokens never sees.

import { randomUUID } from "node:crypto";
import { appendEntry, payloadHash } from "../audit/index.js";
import { buildPrompt, parseCartResponse } from "../agent/index.js";
import { persistIssuedToken } from "../checkout/index.js";
import { evaluate } from "../engine/index.js";
import type { Cart } from "../engine/types.js";
import { issueToken } from "../tokens/index.js";
import { createCart, createDecision, createRequest, getGrant } from "../store/index.js";
import type { Request } from "../store/index.js";
import type { OrchestratorResult, RunShoppingRequestParams } from "./types.js";

export async function runShoppingRequest(params: RunShoppingRequestParams): Promise<OrchestratorResult> {
  const { db, grantId, agentId, rawUtterance, agentClient, catalog, privateKey } = params;
  const now = params.now ?? new Date().toISOString();

  const grant = getGrant(db, grantId);
  if (grant === null) {
    return { ok: false, reason: "grant_not_found", detail: `no grant found for id "${grantId}"` };
  }

  const request: Request = {
    id: randomUUID(),
    grantId: grant.id,
    rawUtterance,
    structured: null,
    createdAt: now,
  };
  createRequest(db, request);
  appendEntry(
    db,
    agentId,
    "request_received",
    { requestId: request.id, grantId: grant.id, rawUtterance },
    now,
  );

  const prompt = buildPrompt(rawUtterance, catalog);
  const rawResponse = await agentClient.complete(prompt);
  const parsed = parseCartResponse(rawResponse, catalog);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, detail: parsed.detail };
  }

  const cart: Cart = {
    id: randomUUID(),
    requestId: request.id,
    items: parsed.cart.items,
    totalCents: parsed.cart.totalCents,
    createdAt: now,
  };
  createCart(db, cart);
  appendEntry(
    db,
    agentId,
    "cart_proposed",
    { cartId: cart.id, requestId: request.id, items: cart.items, totalCents: cart.totalCents },
    now,
  );

  const decision = evaluate({ id: randomUUID(), grant, cart, agentId, evaluatedAt: now });
  createDecision(db, decision);
  appendEntry(
    db,
    agentId,
    "decision_rendered",
    { decisionId: decision.id, cartId: cart.id, verdict: decision.verdict, ruleResults: decision.ruleResults },
    now,
  );

  if (decision.verdict !== "allow") {
    return { ok: true, decision, token: null };
  }

  const requestHash = payloadHash(request);
  const nonce = randomUUID();
  const token = issueToken(decision, grant, cart, requestHash, now, nonce, privateKey);
  persistIssuedToken(db, token);
  appendEntry(
    db,
    agentId,
    "token_issued",
    { nonce: token.nonce, cartHash: token.cartHash, expiresAt: token.expiresAt },
    now,
  );

  return { ok: true, decision, token };
}
