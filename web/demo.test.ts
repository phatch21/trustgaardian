import { describe, expect, it } from "vitest";
import { GENESIS_PREV_HASH } from "../audit/index.js";
import { DEMO_GRANT_ID, makeDemoGrant } from "../db/demo-grant.js";
import { getGrant } from "../store/index.js";
import {
  handleAgentMismatchCheckout,
  handleResetDemo,
  handleTamperAudit,
  handleTamperCartCheckout,
  handleVerifyChain,
} from "./demo.js";
import { getAuditLog, handleUtterance } from "./handlers.js";
import { makeTestContext } from "./test-helpers.js";

const UTTERANCE = "find unicorn birthday party supplies under $80, no third-party sellers";

async function approveCart(ctx: ReturnType<typeof makeTestContext>) {
  const result = await handleUtterance(ctx, UTTERANCE, { explicitScenario: "clean_cart_match" });
  if (!result.ok || result.token === null || result.decision === null) {
    throw new Error("expected an allow decision with a token");
  }
  return { cartId: result.decision.cartId, token: result.token };
}

describe("demo controls", () => {
  it("tamper cart then checkout: cart_hash_mismatch", async () => {
    const ctx = makeTestContext();
    const { cartId, token } = await approveCart(ctx);

    const result = handleTamperCartCheckout(ctx, cartId, token);

    expect(result).toEqual({ ok: false, reason: "cart_hash_mismatch" });
  });

  it("present a valid token as a different agent id: agent_mismatch", async () => {
    const ctx = makeTestContext();
    const { cartId, token } = await approveCart(ctx);

    const result = handleAgentMismatchCheckout(ctx, cartId, token);

    expect(result).toEqual({ ok: false, reason: "agent_mismatch" });
  });

  it("tamper with an audit entry then run the verifier: reports the failing seq and reason", async () => {
    const ctx = makeTestContext();
    await approveCart(ctx);

    const { entries } = getAuditLog(ctx);
    expect(entries.length).toBeGreaterThan(0);
    const targetSeq = entries[0]!.seq;

    const tamperResult = handleTamperAudit(ctx, targetSeq);
    expect(tamperResult).toEqual({ ok: true, seq: targetSeq });

    const verifyResult = handleVerifyChain(ctx);
    expect(verifyResult).toEqual({ ok: false, seq: targetSeq, reason: "hash_mismatch" });
  });

  it("tamper-audit against a nonexistent seq reports an error rather than silently succeeding", () => {
    const ctx = makeTestContext();
    const result = handleTamperAudit(ctx, 999);
    expect(result).toEqual({ ok: false, error: "no audit entry with seq 999" });
  });

  it("an intact chain verifies ok before any tampering", async () => {
    const ctx = makeTestContext();
    await approveCart(ctx);
    expect(handleVerifyChain(ctx)).toEqual({ ok: true });
  });
});

describe("reset demo state", () => {
  const TABLES = ["audit", "tokens", "decisions", "carts", "requests", "grants"];

  function rowCounts(ctx: ReturnType<typeof makeTestContext>): Record<string, number> {
    return Object.fromEntries(
      TABLES.map((table) => {
        const row = ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
        return [table, row.n];
      }),
    );
  }

  // Leaves rows in every table and a tampered audit chain — the state a
  // full demo take ends in.
  async function dirtyDemoState(ctx: ReturnType<typeof makeTestContext>) {
    const { cartId, token } = await approveCart(ctx);
    handleTamperCartCheckout(ctx, cartId, token);
    handleTamperAudit(ctx, 1);
    expect(handleVerifyChain(ctx)).toEqual({ ok: false, seq: 1, reason: "hash_mismatch" });
    for (const [table, n] of Object.entries(rowCounts(ctx))) {
      expect(n, table).toBeGreaterThan(0);
    }
  }

  it("clears every table and reseeds exactly the demo grant", async () => {
    const ctx = makeTestContext();
    await dirtyDemoState(ctx);

    expect(handleResetDemo(ctx)).toEqual({ ok: true });

    expect(rowCounts(ctx)).toEqual({ audit: 0, tokens: 0, decisions: 0, carts: 0, requests: 0, grants: 1 });
    expect(getGrant(ctx.db, DEMO_GRANT_ID)).toEqual(makeDemoGrant());
  });

  it("verifyChain passes on the fresh chain immediately after reset", async () => {
    const ctx = makeTestContext();
    await dirtyDemoState(ctx);

    handleResetDemo(ctx);

    expect(handleVerifyChain(ctx)).toEqual({ ok: true });
  });

  it("a request after reset produces a valid decision and a chain starting from genesis", async () => {
    const ctx = makeTestContext();
    await dirtyDemoState(ctx);
    handleResetDemo(ctx);

    const result = await handleUtterance(ctx, UTTERANCE, { explicitScenario: "clean_cart_match" });

    expect(result.ok).toBe(true);
    expect(result.decision?.verdict).toBe("allow");
    expect(result.token).not.toBeNull();

    const { entries } = getAuditLog(ctx);
    expect(entries.length).toBeGreaterThan(0);
    // AUTOINCREMENT would otherwise continue past the deleted rows.
    expect(entries[0]).toMatchObject({ seq: 1, prevHash: GENESIS_PREV_HASH });
    expect(entries.map((entry) => entry.seq)).toEqual(entries.map((_, index) => index + 1));
    expect(handleVerifyChain(ctx)).toEqual({ ok: true });
  });
});
