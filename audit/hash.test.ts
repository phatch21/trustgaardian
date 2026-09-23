import { describe, expect, it } from "vitest";
import { GENESIS_PREV_HASH, canonicalizePayload, computeEntryHash, payloadHash } from "./hash.js";

describe("computeEntryHash", () => {
  const base = {
    prevHash: "a".repeat(64),
    timestamp: "2026-06-01T00:00:00.000Z",
    actor: "agent_1",
    eventType: "grant_created",
    payloadHash: "b".repeat(64),
  };

  it("is deterministic for the same inputs", () => {
    const h1 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    const h2 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    expect(h1).toBe(h2);
  });

  it("changes when prev_hash changes", () => {
    const h1 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    const h2 = computeEntryHash("c".repeat(64), base.timestamp, base.actor, base.eventType, base.payloadHash);
    expect(h1).not.toBe(h2);
  });

  it("changes when timestamp changes", () => {
    const h1 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    const h2 = computeEntryHash(base.prevHash, "2026-06-01T00:00:01.000Z", base.actor, base.eventType, base.payloadHash);
    expect(h1).not.toBe(h2);
  });

  it("changes when actor changes", () => {
    const h1 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    const h2 = computeEntryHash(base.prevHash, base.timestamp, "agent_2", base.eventType, base.payloadHash);
    expect(h1).not.toBe(h2);
  });

  it("changes when event_type changes", () => {
    const h1 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    const h2 = computeEntryHash(base.prevHash, base.timestamp, base.actor, "request_received", base.payloadHash);
    expect(h1).not.toBe(h2);
  });

  it("changes when payload_hash changes", () => {
    const h1 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, base.payloadHash);
    const h2 = computeEntryHash(base.prevHash, base.timestamp, base.actor, base.eventType, "d".repeat(64));
    expect(h1).not.toBe(h2);
  });

  it("is not fooled by field boundary shifting (length-prefixing prevents concatenation collisions)", () => {
    // Without length-prefixing, actor="ab" + eventType="cd" would collide
    // with actor="a" + eventType="bcd" under naive concatenation.
    const h1 = computeEntryHash(base.prevHash, base.timestamp, "ab", "cd", base.payloadHash);
    const h2 = computeEntryHash(base.prevHash, base.timestamp, "a", "bcd", base.payloadHash);
    expect(h1).not.toBe(h2);
  });

  it("genesis prev_hash is exactly 64 zero characters", () => {
    expect(GENESIS_PREV_HASH).toBe("0".repeat(64));
    expect(GENESIS_PREV_HASH).toHaveLength(64);
  });
});

describe("canonicalizePayload / payloadHash", () => {
  it("is insensitive to object key order", () => {
    const a = { grantId: "g1", agentId: "a1" };
    const b = { agentId: "a1", grantId: "g1" };
    expect(canonicalizePayload(a)).toBe(canonicalizePayload(b));
    expect(payloadHash(a)).toBe(payloadHash(b));
  });

  it("is insensitive to nested object key order", () => {
    const a = { cart: { id: "c1", total: 100 } };
    const b = { cart: { total: 100, id: "c1" } };
    expect(payloadHash(a)).toBe(payloadHash(b));
  });

  it("changes when a value changes", () => {
    expect(payloadHash({ total: 100 })).not.toBe(payloadHash({ total: 101 }));
  });

  it("is deterministic across repeated calls", () => {
    const payload = { a: [1, 2, 3], b: { c: "d" } };
    expect(payloadHash(payload)).toBe(payloadHash(payload));
  });
});
