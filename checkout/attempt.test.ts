import Database from "better-sqlite3";
import { verifyChain } from "../audit/index.js";
import { migrate, openDb } from "../db/index.js";
import { describe, expect, it } from "vitest";
import { issueToken } from "../tokens/index.js";
import { attemptCheckout } from "./attempt.js";
import {
  issueAndPersistToken,
  makeCart,
  makeDecision,
  makeGrant,
  makeItem,
  makeKeyPair,
  makeRequestHash,
  makeTempFileDb,
  makeTestDb,
} from "./test-helpers.js";

const ISSUED_AT = "2026-06-01T00:00:00.000Z";
const WITHIN_LIFETIME = "2026-06-01T00:01:30.000Z"; // +90s, under the 120s lifetime
const AFTER_EXPIRY = "2026-06-01T00:02:01.000Z"; // +121s

interface AuditRow {
  event_type: string;
  actor: string;
}

function lastTwoAuditEvents(db: ReturnType<typeof makeTestDb>): [AuditRow, AuditRow] {
  const rows = db
    .prepare("SELECT event_type, actor FROM audit ORDER BY seq DESC LIMIT 2")
    .all() as AuditRow[];
  if (rows.length !== 2) {
    throw new Error(`expected exactly 2 audit rows, got ${rows.length}`);
  }
  return [rows[0]!, rows[1]!];
}

describe("attemptCheckout: happy path", () => {
  it("consumes the token and returns success", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const result = attemptCheckout(db, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: true, nonce: "nonce-1", consumedAt: WITHIN_LIFETIME });

    const row = db.prepare("SELECT consumed_at FROM tokens WHERE nonce = ?").get("nonce-1") as {
      consumed_at: string | null;
    };
    expect(row.consumed_at).toBe(WITHIN_LIFETIME);
  });

  it("writes both a checkout_attempted and a checkout_result audit entry", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    attemptCheckout(db, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);

    const [result, attempted] = lastTwoAuditEvents(db);
    expect(attempted).toMatchObject({ event_type: "checkout_attempted", actor: grant.agentId });
    expect(result).toMatchObject({ event_type: "checkout_result", actor: grant.agentId });
  });
});

describe("attemptCheckout: rejection reasons", () => {
  it("already_consumed: a second presentation of the same token is rejected", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const first = attemptCheckout(db, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);
    expect(first).toEqual({ ok: true, nonce: "nonce-1", consumedAt: WITHIN_LIFETIME });

    const second = attemptCheckout(db, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);
    expect(second).toEqual({ ok: false, reason: "already_consumed" });

    const [result, attempted] = lastTwoAuditEvents(db);
    expect(attempted.event_type).toBe("checkout_attempted");
    expect(result.event_type).toBe("checkout_result");
  });

  it("cart_hash_mismatch: a tampered cart is rejected and never burns the token", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const approvedCart = makeCart({ items: [makeItem({ unitPriceCents: 1_000, quantity: 1 })] });
    const presentedCart = makeCart({ items: [makeItem({ unitPriceCents: 2_000, quantity: 1 })] });
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      approvedCart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const result = attemptCheckout(db, token, presentedCart, grant.agentId, WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: false, reason: "cart_hash_mismatch" });

    const row = db.prepare("SELECT consumed_at FROM tokens WHERE nonce = ?").get("nonce-1") as {
      consumed_at: string | null;
    };
    expect(row.consumed_at).toBeNull();

    const [checkoutResult, attempted] = lastTwoAuditEvents(db);
    expect(attempted.event_type).toBe("checkout_attempted");
    expect(checkoutResult.event_type).toBe("checkout_result");
  });

  it("expired: a token presented after its 120s lifetime is rejected", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const result = attemptCheckout(db, token, cart, grant.agentId, AFTER_EXPIRY, publicKey);

    expect(result).toEqual({ ok: false, reason: "expired" });

    const [checkoutResult, attempted] = lastTwoAuditEvents(db);
    expect(attempted.event_type).toBe("checkout_attempted");
    expect(checkoutResult.event_type).toBe("checkout_result");
  });

  it("agent_mismatch: presentation by an agent other than the one the token was issued to is rejected", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant({ agentId: "agent_1" });
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const result = attemptCheckout(db, token, cart, "agent_2", WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: false, reason: "agent_mismatch" });

    const [checkoutResult, attempted] = lastTwoAuditEvents(db);
    expect(attempted.event_type).toBe("checkout_attempted");
    expect(checkoutResult.event_type).toBe("checkout_result");
  });

  it("unknown_nonce: a validly-signed token whose row was never persisted is rejected", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    // issueToken() only, deliberately skipping persistIssuedToken(): a
    // token that is cryptographically valid but that /checkout has never
    // been told about.
    const token = issueToken(
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-never-persisted",
      privateKey,
    );

    const result = attemptCheckout(db, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);

    expect(result).toEqual({ ok: false, reason: "unknown_nonce" });

    const [checkoutResult, attempted] = lastTwoAuditEvents(db);
    expect(attempted.event_type).toBe("checkout_attempted");
    expect(checkoutResult.event_type).toBe("checkout_result");
  });
});

describe("attemptCheckout: audit durability on rejection", () => {
  it("a rejected checkout still leaves both audit entries, and the chain still verifies", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    const result = attemptCheckout(db, token, cart, grant.agentId, AFTER_EXPIRY, publicKey);
    expect(result).toEqual({ ok: false, reason: "expired" });

    const rows = db.prepare("SELECT event_type FROM audit ORDER BY seq ASC").all() as {
      event_type: string;
    }[];
    expect(rows.map((r) => r.event_type)).toEqual(["checkout_attempted", "checkout_result"]);

    expect(verifyChain(db)).toEqual({ ok: true });
  });

  it("internal_error: an unanticipated exception (not SQLITE_BUSY) is caught, not thrown, and still leaves both audit entries", () => {
    const db = makeTestDb();
    const { publicKey, privateKey } = makeKeyPair();
    const grant = makeGrant();
    const cart = makeCart();
    const decision = makeDecision({ verdict: "allow" });

    const token = issueAndPersistToken(
      db,
      decision,
      grant,
      cart,
      makeRequestHash(),
      ISSUED_AT,
      "nonce-1",
      privateKey,
    );

    // A genuinely unexpected failure, distinct from lock contention: the
    // tokens table itself is gone. The audit table is untouched, so both
    // writes below can still succeed even though the checkout can't.
    db.prepare("DROP TABLE tokens").run();

    const result = attemptCheckout(db, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);
    expect(result).toEqual({ ok: false, reason: "internal_error" });

    const rows = db.prepare("SELECT event_type FROM audit ORDER BY seq ASC").all() as {
      event_type: string;
    }[];
    expect(rows.map((r) => r.event_type)).toEqual(["checkout_attempted", "checkout_result"]);

    expect(verifyChain(db)).toEqual({ ok: true });
  });
});

describe("attemptCheckout: concurrent presentations of one token", () => {
  it("lets exactly one of two racing presentations succeed", () => {
    const { path, cleanup } = makeTempFileDb();
    let dbA: ReturnType<typeof openDb> | undefined;
    let dbB: ReturnType<typeof openDb> | undefined;
    try {
      const a = openDb(path);
      dbA = a;
      migrate(a);
      // better-sqlite3 defaults to a 5000ms busy_timeout, silently
      // retrying before it gives up on a held lock. b needs a short one
      // instead: the point of this test is that it can't get the lock at
      // all while a holds it, not that it eventually would.
      const b = new Database(path, { timeout: 100 });
      b.pragma("journal_mode = WAL");
      b.pragma("foreign_keys = ON");
      dbB = b;

      const { publicKey, privateKey } = makeKeyPair();
      const grant = makeGrant();
      const cart = makeCart();
      const decision = makeDecision({ verdict: "allow" });

      const token = issueAndPersistToken(
        a,
        decision,
        grant,
        cart,
        makeRequestHash(),
        ISSUED_AT,
        "nonce-race",
        privateKey,
      );

      // Simulate connection a being mid-flight inside attemptCheckout's
      // own transaction: it has taken the immediate write lock and read
      // the row, but not yet written consumed_at or committed. Node is
      // single-threaded, so the only way to observe a second connection's
      // behavior "during" that window is to hold the lock open manually
      // like this rather than literally interleaving two calls.
      a.prepare("BEGIN IMMEDIATE").run();
      a.prepare("SELECT consumed_at FROM tokens WHERE nonce = ?").get(token.nonce);

      // A fully independent presentation, on a separate connection, can't
      // even start while a holds the write lock — SQLite grants it to one
      // writer at a time. This is what makes "exactly one succeeds" true
      // rather than merely likely. It must come back as a clean rejection,
      // not an exception: every other failure in this codebase is a
      // discriminated result, and attemptCheckout is no exception (pun
      // intended) to that. Note this specific attempt can't itself be
      // logged to the audit table — b's own checkout_attempted write hits
      // the same held lock — which is an inherent limit of a single
      // SQLite writer, not a bug; see attempt.ts's comment on the
      // best-effort checkout_result write in the catch block.
      const blocked = attemptCheckout(b, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);
      expect(blocked).toEqual({ ok: false, reason: "lock_contention" });

      // Release the simulated lock without having consumed anything, then
      // let a real presentation run to completion.
      a.prepare("ROLLBACK").run();

      const winner = attemptCheckout(a, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);
      expect(winner).toEqual({ ok: true, nonce: token.nonce, consumedAt: WITHIN_LIFETIME });

      // The token is now genuinely consumed: any further presentation,
      // racing or not, is rejected rather than merely blocked.
      const loser = attemptCheckout(b, token, cart, grant.agentId, WITHIN_LIFETIME, publicKey);
      expect(loser).toEqual({ ok: false, reason: "already_consumed" });

      // Despite the earlier lock_contention attempt that couldn't log
      // itself, everything that *was* written is still a valid chain.
      expect(verifyChain(a)).toEqual({ ok: true });
    } finally {
      // Close before removing the directory — Windows won't let the temp
      // dir be deleted while a connection still has the file (or its WAL
      // sidecar) open.
      dbA?.close();
      dbB?.close();
      cleanup();
    }
  });
});
