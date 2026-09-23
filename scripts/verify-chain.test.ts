import type Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { appendEntry } from "../audit/index.js";
import { migrate, openDb } from "../db/index.js";
import { buildReport, exitCodeFor } from "./verify-chain.js";

function makeTestDb(): Database.Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}

describe("verify-chain report", () => {
  it("reports OK with the entry count and head hash for a clean chain", () => {
    const db = makeTestDb();
    appendEntry(db, "agent_1", "grant_created", { grantId: "g1" }, "2026-06-01T00:00:00.000Z");
    appendEntry(db, "agent_1", "request_received", { requestId: "r1" }, "2026-06-01T00:00:01.000Z");
    const last = appendEntry(
      db,
      "engine",
      "decision_rendered",
      { verdict: "allow" },
      "2026-06-01T00:00:02.000Z",
    );

    const report = buildReport(db);

    expect(report.ok).toBe(true);
    expect(report.message).toContain("entries verified: 3");
    expect(report.message).toContain(last.entryHash);
    expect(exitCodeFor(report)).toBe(0);
  });

  it("reports zero entries as OK for an empty, migrated database", () => {
    const db = makeTestDb();

    const report = buildReport(db);

    expect(report.ok).toBe(true);
    expect(report.message).toContain("entries verified: 0");
    expect(exitCodeFor(report)).toBe(0);
  });

  it("reports the seq, reason code, and an explanation for a tampered chain", () => {
    const db = makeTestDb();
    appendEntry(db, "agent_1", "grant_created", { grantId: "g1" }, "2026-06-01T00:00:00.000Z");
    appendEntry(db, "agent_1", "request_received", { requestId: "r1" }, "2026-06-01T00:00:01.000Z");
    appendEntry(db, "engine", "decision_rendered", { verdict: "allow" }, "2026-06-01T00:00:02.000Z");

    db.prepare("UPDATE audit SET payload_hash = ? WHERE seq = 2").run("f".repeat(64));

    const report = buildReport(db);

    expect(report.ok).toBe(false);
    expect(report.message).toContain("seq 2");
    expect(report.message).toContain("reason: hash_mismatch");
    expect(report.message.toLowerCase()).toContain("recomputation");
    expect(exitCodeFor(report)).toBe(1);
  });

  it("reports a deleted row as a seq_gap with an explanation", () => {
    const db = makeTestDb();
    appendEntry(db, "agent_1", "grant_created", { grantId: "g1" }, "2026-06-01T00:00:00.000Z");
    appendEntry(db, "agent_1", "request_received", { requestId: "r1" }, "2026-06-01T00:00:01.000Z");
    appendEntry(db, "engine", "decision_rendered", { verdict: "allow" }, "2026-06-01T00:00:02.000Z");

    db.prepare("DELETE FROM audit WHERE seq = 2").run();

    const report = buildReport(db);

    expect(report.ok).toBe(false);
    expect(report.message).toContain("seq 2");
    expect(report.message).toContain("reason: seq_gap");
    expect(report.message.toLowerCase()).toContain("missing");
    expect(exitCodeFor(report)).toBe(1);
  });

  it("fails cleanly rather than throwing when the database has no audit table", () => {
    const db = openDb(":memory:"); // not migrated

    const report = buildReport(db);

    expect(report.ok).toBe(false);
    expect(report.message).toContain("FAIL");
    expect(exitCodeFor(report)).toBe(1);
  });
});
