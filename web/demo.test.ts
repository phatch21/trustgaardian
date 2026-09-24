import { describe, expect, it } from "vitest";
import {
  handleAgentMismatchCheckout,
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
