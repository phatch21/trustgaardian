import { describe, expect, it } from "vitest";
import { createGrant } from "./grants.js";
import { createRequest, getRequest } from "./requests.js";
import { makeGrant, makeRequest, makeTestDb } from "./test-helpers.js";

describe("createRequest / getRequest", () => {
  it("round-trips a request with structured left null", () => {
    const db = makeTestDb();
    createGrant(db, makeGrant());
    const request = makeRequest();

    createRequest(db, request);
    const result = getRequest(db, request.id);

    expect(result).toEqual(request);
    expect(result?.structured).toBeNull();
  });

  it("returns null for an id that was never created", () => {
    const db = makeTestDb();
    expect(getRequest(db, "does_not_exist")).toBeNull();
  });
});
