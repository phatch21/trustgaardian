import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FixtureAgentClient } from "../agent/index.js";
import { loadCatalog } from "../catalog/index.js";
import type { Grant } from "../engine/types.js";
import { createGrant } from "../store/index.js";
import { makeTestDb } from "../store/test-helpers.js";
import { verifyToken } from "../tokens/index.js";
import { runShoppingRequest } from "./run.js";

const catalog = loadCatalog();
const NOW = "2026-01-01T00:00:00.000Z";

function makeGrant(overrides: Partial<Grant> = {}): Grant {
  return {
    id: "grant_1",
    userId: "user_1",
    agentId: "agent_1",
    createdAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    status: "active",
    constraints: {
      spend: { perTransactionCents: 10_000, perWindowCents: 50_000, window: "P7D", currency: "USD" },
      merchants: { allow: [], deny: [] },
      categories: { allow: [], deny: [] },
      frequency: { maxPurchases: 10, window: "P7D" },
      items: { maxUnitPriceCents: 10_000, maxQuantity: 10 },
      escalation: { requireApprovalAboveCents: 20_000, autoDenyOn: [] },
    },
    ...overrides,
  };
}

describe("runShoppingRequest", () => {
  it("happy path: a well-formed, in-budget cart produces an allow decision and a valid token", async () => {
    const db = makeTestDb();
    const grant = makeGrant();
    createGrant(db, grant);
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");

    const result = await runShoppingRequest({
      db,
      grantId: grant.id,
      agentId: grant.agentId,
      rawUtterance: "find unicorn birthday party supplies under $80, no third-party sellers",
      agentClient: new FixtureAgentClient("clean_cart_match"),
      catalog,
      privateKey,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.verdict).toBe("allow");
    expect(result.token).not.toBeNull();
    if (result.token === null) return;

    // The token has to actually verify, not just exist — issueToken and
    // persistIssuedToken alone don't prove the flow produced something
    // /checkout would accept.
    const cartRow = db.prepare("SELECT * FROM carts ORDER BY created_at DESC LIMIT 1").get() as {
      id: string;
      request_id: string;
      items_json: string;
      total_cents: number;
      created_at: string;
    };
    const cart = {
      id: cartRow.id,
      requestId: cartRow.request_id,
      items: JSON.parse(cartRow.items_json),
      totalCents: cartRow.total_cents,
      createdAt: cartRow.created_at,
    };
    const verified = verifyToken(result.token, cart, grant.agentId, NOW, publicKey);
    expect(verified.ok).toBe(true);
  });

  it("over-budget: a well-formed cart exceeding the transaction cap is denied with the rule breakdown intact", async () => {
    const db = makeTestDb();
    // clean_cart_match's catalog total is 3096 cents; cap it well below that.
    const grant = makeGrant({
      id: "grant_2",
      constraints: {
        spend: { perTransactionCents: 1_000, perWindowCents: 50_000, window: "P7D", currency: "USD" },
        merchants: { allow: [], deny: [] },
        categories: { allow: [], deny: [] },
        frequency: { maxPurchases: 10, window: "P7D" },
        items: { maxUnitPriceCents: 10_000, maxQuantity: 10 },
        escalation: { requireApprovalAboveCents: 20_000, autoDenyOn: [] },
      },
    });
    createGrant(db, grant);
    const { privateKey } = generateKeyPairSync("ed25519");

    const result = await runShoppingRequest({
      db,
      grantId: grant.id,
      agentId: grant.agentId,
      rawUtterance: "find unicorn birthday party supplies under $80, no third-party sellers",
      agentClient: new FixtureAgentClient("clean_cart_match"),
      catalog,
      privateKey,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.verdict).toBe("deny");
    expect(result.token).toBeNull();

    const capRule = result.decision.ruleResults.find((r) => r.ruleId === "transaction_cap");
    expect(capRule).toBeDefined();
    expect(capRule?.passed).toBe(false);
    expect(capRule?.observed).toBe(3_096);
    expect(capRule?.limit).toBe(1_000);
    // The breakdown is the full result set, not just the failing rule.
    expect(result.decision.ruleResults.length).toBeGreaterThan(1);
  });

  it("malformed agent response: fails before evaluation, but the request is still recorded", async () => {
    const db = makeTestDb();
    const grant = makeGrant({ id: "grant_3" });
    createGrant(db, grant);
    const { privateKey } = generateKeyPairSync("ed25519");

    const requestsBefore = (db.prepare("SELECT COUNT(*) AS c FROM requests").get() as { c: number }).c;
    const decisionsBefore = (db.prepare("SELECT COUNT(*) AS c FROM decisions").get() as { c: number }).c;

    const result = await runShoppingRequest({
      db,
      grantId: grant.id,
      agentId: grant.agentId,
      rawUtterance: "find unicorn birthday party supplies under $80, no third-party sellers",
      agentClient: new FixtureAgentClient("malformed_json"),
      catalog,
      privateKey,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_json");

    const requestsAfter = (db.prepare("SELECT COUNT(*) AS c FROM requests").get() as { c: number }).c;
    const decisionsAfter = (db.prepare("SELECT COUNT(*) AS c FROM decisions").get() as { c: number }).c;
    // Step order: the request is recorded before /agent is ever called, so
    // it survives a malformed response even though no Decision does.
    expect(requestsAfter).toBe(requestsBefore + 1);
    expect(decisionsAfter).toBe(decisionsBefore);
  });

  it("recorded_sonnet_false_compliance: the engine denies on the true catalog total, not the model's reported figure", async () => {
    const db = makeTestDb();
    // The model's own total_cents was 12885 and it called that "well under
    // the $80 budget" in its notes; the true catalog-priced total is 13184
    // (agent/parse.test.ts asserts this same pair of numbers). Cap sits
    // between the two: a cap trusting the model's arithmetic would allow
    // this cart, and would be wrong to.
    const grant = makeGrant({
      id: "grant_4",
      constraints: {
        spend: { perTransactionCents: 13_000, perWindowCents: 50_000, window: "P7D", currency: "USD" },
        merchants: { allow: [], deny: [] },
        categories: { allow: [], deny: [] },
        frequency: { maxPurchases: 20, window: "P7D" },
        items: { maxUnitPriceCents: 10_000, maxQuantity: 10 },
        escalation: { requireApprovalAboveCents: 50_000, autoDenyOn: [] },
      },
    });
    createGrant(db, grant);
    const { privateKey } = generateKeyPairSync("ed25519");

    const result = await runShoppingRequest({
      db,
      grantId: grant.id,
      agentId: grant.agentId,
      rawUtterance: "find unicorn birthday party supplies under $80, no third-party sellers",
      agentClient: new FixtureAgentClient("recorded_sonnet_false_compliance"),
      catalog,
      privateKey,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision.verdict).toBe("deny");
    expect(result.token).toBeNull();

    const capRule = result.decision.ruleResults.find((r) => r.ruleId === "transaction_cap");
    expect(capRule?.passed).toBe(false);
    expect(capRule?.observed).toBe(13_184);
    expect(capRule?.observed).not.toBe(12_885);
    expect(capRule?.limit).toBe(13_000);
  });
});
