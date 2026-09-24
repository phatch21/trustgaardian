import { describe, expect, it } from "vitest";
import { createGrant, getGrant } from "./grants.js";
import { makeGrant, makeTestDb } from "./test-helpers.js";

describe("createGrant / getGrant", () => {
  it("round-trips a grant, including a structured constraints object", () => {
    const db = makeTestDb();
    const grant = makeGrant({ constraints: { spend: { perTransactionCents: 5_000 } } });

    createGrant(db, grant);
    const result = getGrant(db, grant.id);

    expect(result).toEqual(grant);
  });

  it("returns null for an id that was never created", () => {
    const db = makeTestDb();
    expect(getGrant(db, "does_not_exist")).toBeNull();
  });
});
