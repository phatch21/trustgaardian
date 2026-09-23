import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueToken } from "./issue.js";
import { makeCart, makeDecision, makeGrant, makeItem, makeKeyPair, makeRequestHash } from "./test-helpers.js";
import { verifyToken } from "./verify.js";

const ISSUED_AT = "2026-06-01T00:00:00.000Z";
const WITHIN_LIFETIME = "2026-06-01T00:01:30.000Z"; // +90s, under the 120s lifetime
const AFTER_EXPIRY = "2026-06-01T00:02:01.000Z"; // +121s

describe("issueToken / verifyToken round trip", () => {
  it("verifies a freshly issued token presented by the agent it was issued to", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);
    const result = verifyToken(token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: true, token });
  });
});

describe("verifyToken rejection reasons", () => {
  it("malformed_field: rejects a token that isn't a well-formed ExecutionToken", () => {
    const { publicKey } = makeKeyPair();
    const cart = makeCart();

    expect(verifyToken({}, cart, "agent_1", WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "malformed_field",
    });
    expect(verifyToken("not a token", cart, "agent_1", WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "malformed_field",
    });
    expect(verifyToken(null, cart, "agent_1", WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "malformed_field",
    });
  });

  it("bad_signature: rejects a token whose signature was corrupted", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);
    const corrupted = { ...token, signature: token.signature.replace(/^./, token.signature[0] === "0" ? "1" : "0") };

    expect(verifyToken(corrupted, cart, grant.agentId, WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("agent_mismatch: rejects a valid token presented by an agent other than the one it was issued to", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant({ agentId: "agent_1" });
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);

    expect(verifyToken(token, cart, "agent_2", WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "agent_mismatch",
    });
  });

  it("malformed_field: rejects an empty-string callingAgentId rather than matching it by accident", () => {
    const { publicKey, privateKey } = makeKeyPair();
    // grant.agentId is a normal non-empty value here — the point is that an
    // empty callingAgentId must be rejected as malformed even though the
    // token itself is perfectly well-formed, not that it happens to equal
    // a (structurally invalid) empty token field.
    const grant = makeGrant({ agentId: "agent_1" });
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);

    expect(verifyToken(token, cart, "", WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "malformed_field",
    });
  });

  it("malformed_field: rejects a missing (undefined) callingAgentId", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);

    expect(
      verifyToken(token, cart, undefined as unknown as string, WITHIN_LIFETIME, publicKey),
    ).toEqual({ ok: false, reason: "malformed_field" });
  });

  it("not_yet_valid: rejects a token presented before its issued_at", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);
    const beforeIssuance = "2026-05-31T23:59:59.000Z";

    expect(verifyToken(token, cart, grant.agentId, beforeIssuance, publicKey)).toEqual({
      ok: false,
      reason: "not_yet_valid",
    });
  });

  it("expired: rejects a token presented after its 120s lifetime", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);

    expect(verifyToken(token, cart, grant.agentId, AFTER_EXPIRY, publicKey)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("verdict_not_allow: rejects a token issued for a deny decision", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "deny" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);

    expect(verifyToken(token, cart, grant.agentId, WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "verdict_not_allow",
    });
  });

  it("cart_hash_mismatch: rejects when the presented cart's total differs from what was signed", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const approvedCart = makeCart({ items: [makeItem({ unitPriceCents: 1_000, quantity: 1 })] });
    const presentedCart = makeCart({ items: [makeItem({ unitPriceCents: 2_000, quantity: 1 })] });
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(
      decision,
      grant,
      approvedCart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    expect(verifyToken(token, presentedCart, grant.agentId, WITHIN_LIFETIME, publicKey)).toEqual({
      ok: false,
      reason: "cart_hash_mismatch",
    });
  });
});

describe("cart substitution after approval", () => {
  it("rejects a swapped item even when the total_cents is unchanged and the signature is otherwise valid", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const decision = makeDecision({ verdict: "allow" });

    const approvedCart = makeCart({
      items: [makeItem({ sku: "book_1", merchant: "acme", unitPriceCents: 1_000, quantity: 1 })],
      totalCents: 1_000,
    });
    // Same total, same item count — a cart-total check alone would miss this.
    const swappedCart = makeCart({
      items: [makeItem({ sku: "gift_card_1", merchant: "shady-co", unitPriceCents: 1_000, quantity: 1 })],
      totalCents: 1_000,
    });

    const token = issueToken(
      decision,
      grant,
      approvedCart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const result = verifyToken(token, swappedCart, grant.agentId, WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: false, reason: "cart_hash_mismatch" });
  });
});

describe("key mismatch", () => {
  it("rejects a validly-formed token verified against an unrelated key pair", () => {
    const { privateKey } = makeKeyPair();
    const { publicKey: unrelatedPublicKey } = generateKeyPairSync("ed25519");
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);

    expect(verifyToken(token, cart, grant.agentId, WITHIN_LIFETIME, unrelatedPublicKey)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });
});

describe("check ordering: signature before agent binding", () => {
  it("reports bad_signature, not agent_mismatch, for a forged token presented by the wrong agent", () => {
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant({ agentId: "agent_1" });
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueToken(decision, grant, cart, makeRequestHash(), ISSUED_AT, "nonce-1", privateKey);
    const forged = {
      ...token,
      signature: token.signature.replace(/^./, token.signature[0] === "0" ? "1" : "0"),
    };

    // Wrong agent AND a corrupted signature. If the agent check ran first,
    // this would report agent_mismatch and leak that agent_id was
    // examinable on an unauthenticated token. It must report bad_signature.
    const result = verifyToken(forged, cart, "agent_2", WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });
});
