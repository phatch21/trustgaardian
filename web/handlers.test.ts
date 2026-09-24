import { describe, expect, it } from "vitest";
import { getAuditLog, getGrantSummary, handleUtterance } from "./handlers.js";
import { makeTestContext } from "./test-helpers.js";

const UTTERANCE = "find unicorn birthday party supplies under $80, no third-party sellers";

describe("getGrantSummary", () => {
  it("returns the demo grant's parsed constraints", () => {
    const ctx = makeTestContext();
    const summary = getGrantSummary(ctx);

    expect(summary).not.toBeNull();
    expect(summary?.constraints.spend.perTransactionCents).toBe(8_000);
  });

  it("returns null when no grant has been seeded", () => {
    const ctx = makeTestContext({ seedGrant: false });
    expect(getGrantSummary(ctx)).toBeNull();
  });
});

describe("handleUtterance", () => {
  it("allow: a well-formed, in-budget cart returns ok, an approved decision, and a token", async () => {
    const ctx = makeTestContext();

    const result = await handleUtterance(ctx, UTTERANCE, { explicitScenario: "clean_cart_match" });

    expect(result.ok).toBe(true);
    expect(result.decision?.verdict).toBe("allow");
    expect(result.token).not.toBeNull();
    expect(result.cart?.items.length).toBeGreaterThan(0);
    expect(result.reply).toMatch(/approved/i);
    // No JSON-shaped debris in the spoken reply.
    expect(result.reply).not.toMatch(/[{}[\]]/);
  });

  it("deny: a well-formed cart over the grant's cap returns ok with a deny decision, breakdown intact, and no token", async () => {
    const ctx = makeTestContext();

    const result = await handleUtterance(ctx, UTTERANCE, {
      explicitScenario: "recorded_sonnet_false_compliance",
    });

    expect(result.ok).toBe(true);
    expect(result.decision?.verdict).toBe("deny");
    expect(result.token).toBeNull();
    expect(result.decision?.ruleResults.length).toBeGreaterThan(1);
    const capRule = result.decision?.ruleResults.find((r) => r.ruleId === "transaction_cap");
    expect(capRule?.passed).toBe(false);
    // The engine's own number, not the model's self-reported one.
    expect(capRule?.observed).toBe(13_184);
    expect(result.reply).toMatch(/can't approve/i);
  });

  it("malformed agent response: returns ok:false with the rejection reason, before any decision exists", async () => {
    const ctx = makeTestContext();

    const result = await handleUtterance(ctx, UTTERANCE, { explicitScenario: "malformed_json" });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_json");
    expect(result.decision).toBeNull();
    expect(result.token).toBeNull();
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("grant not found: returns ok:false with grant_not_found when no grant is seeded", async () => {
    const ctx = makeTestContext({ seedGrant: false });

    const result = await handleUtterance(ctx, UTTERANCE, { explicitScenario: "clean_cart_match" });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("grant_not_found");
  });
});

describe("getAuditLog", () => {
  it("reflects entries appended by a completed request", async () => {
    const ctx = makeTestContext();
    await handleUtterance(ctx, UTTERANCE, { explicitScenario: "clean_cart_match" });

    const log = getAuditLog(ctx);

    expect(log.entries.length).toBeGreaterThan(0);
    expect(log.entries.map((e) => e.eventType)).toContain("token_issued");
  });
});
