import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { appendEntry } from "./append.js";
import { GENESIS_PREV_HASH, computeEntryHash } from "./hash.js";
import { makeTestDb } from "./test-helpers.js";
import type { AuditEntry } from "./types.js";
import { verifyChain } from "./verify.js";

function seedChain(
  db: Database.Database,
): [AuditEntry, AuditEntry, AuditEntry, AuditEntry, AuditEntry] {
  return [
    appendEntry(db, "agent_1", "grant_created", { grantId: "g1" }, "2026-06-01T00:00:00.000Z"),
    appendEntry(db, "agent_1", "request_received", { requestId: "r1" }, "2026-06-01T00:00:01.000Z"),
    appendEntry(db, "agent_1", "cart_proposed", { cartId: "c1" }, "2026-06-01T00:00:02.000Z"),
    appendEntry(db, "engine", "decision_rendered", { verdict: "allow" }, "2026-06-01T00:00:03.000Z"),
    appendEntry(db, "engine", "token_issued", { nonce: "n1" }, "2026-06-01T00:00:04.000Z"),
  ];
}

describe("appendEntry / verifyChain", () => {
  it("verifies a chain of several appended entries", () => {
    const db = makeTestDb();
    seedChain(db);

    expect(verifyChain(db)).toEqual({ ok: true });

    const rows = db.prepare("SELECT seq FROM audit ORDER BY seq").all() as { seq: number }[];
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("chains each entry's prev_hash to the previous entry's entry_hash", () => {
    const db = makeTestDb();
    const [first, second] = seedChain(db);
    expect(second.prevHash).toBe(first.entryHash);
  });
});

describe("genesis", () => {
  it("verifies an empty chain as ok", () => {
    const db = makeTestDb();
    expect(verifyChain(db)).toEqual({ ok: true });
  });

  it("uses the all-zero genesis hash as the first entry's prev_hash", () => {
    const db = makeTestDb();
    const entry = appendEntry(db, "agent_1", "grant_created", { grantId: "g1" }, "2026-06-01T00:00:00.000Z");
    expect(entry.prevHash).toBe(GENESIS_PREV_HASH);
    expect(verifyChain(db)).toEqual({ ok: true });
  });
});

describe("tamper detection", () => {
  it("hash_mismatch: reports the exact seq when a payload_hash is tampered", () => {
    const db = makeTestDb();
    seedChain(db);

    db.prepare("UPDATE audit SET payload_hash = ? WHERE seq = 3").run("f".repeat(64));

    expect(verifyChain(db)).toEqual({ ok: false, seq: 3, reason: "hash_mismatch" });
  });

  it("hash_mismatch: reports the exact seq when entry_hash is overwritten directly", () => {
    const db = makeTestDb();
    seedChain(db);

    const row = db.prepare("SELECT entry_hash FROM audit WHERE seq = 3").get() as { entry_hash: string };
    const forged = row.entry_hash.replace(/^./, row.entry_hash[0] === "0" ? "1" : "0");
    db.prepare("UPDATE audit SET entry_hash = ? WHERE seq = 3").run(forged);

    // Overwriting entry_hash in isolation always breaks that row's own
    // internal consistency (its recomputed hash still matches its
    // original, untouched inputs) — it can never surface as broken_link on
    // seq 4 instead, because seq 3's own hash check fails first, before
    // verification ever advances past it.
    expect(verifyChain(db)).toEqual({ ok: false, seq: 3, reason: "hash_mismatch" });
  });

  it("broken_link: reports the exact seq when prev_hash points somewhere other than its real predecessor", () => {
    const db = makeTestDb();
    seedChain(db);

    const row = db
      .prepare("SELECT timestamp, actor, event_type, payload_hash FROM audit WHERE seq = 3")
      .get() as { timestamp: string; actor: string; event_type: string; payload_hash: string };

    // Forge a prev_hash that doesn't match seq 2's real entry_hash, then
    // recompute entry_hash to stay internally consistent with the forged
    // prev_hash — isolating the failure to the link check rather than
    // tripping the hash check too.
    const forgedPrevHash = "e".repeat(64);
    const consistentEntryHash = computeEntryHash(
      forgedPrevHash,
      row.timestamp,
      row.actor,
      row.event_type,
      row.payload_hash,
    );
    db.prepare("UPDATE audit SET prev_hash = ?, entry_hash = ? WHERE seq = 3").run(
      forgedPrevHash,
      consistentEntryHash,
    );

    expect(verifyChain(db)).toEqual({ ok: false, seq: 3, reason: "broken_link" });
  });

  it("seq_gap: reports the missing seq when a middle row is deleted", () => {
    const db = makeTestDb();
    seedChain(db);

    db.prepare("DELETE FROM audit WHERE seq = 3").run();

    expect(verifyChain(db)).toEqual({ ok: false, seq: 3, reason: "seq_gap" });
  });
});
