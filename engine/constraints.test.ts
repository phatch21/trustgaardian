import { describe, expect, it } from "vitest";
import { parseConstraints } from "./constraints.js";
import { makeConstraints } from "./test-helpers.js";

describe("parseConstraints", () => {
  it("returns the typed constraints when every field matches the expected shape", () => {
    const valid = makeConstraints();
    expect(parseConstraints(valid)).toEqual(valid);
  });

  it("fails closed when raw input is not an object", () => {
    expect(parseConstraints(null)).toBeNull();
    expect(parseConstraints(undefined)).toBeNull();
    expect(parseConstraints("not json")).toBeNull();
    expect(parseConstraints(42)).toBeNull();
  });

  it("fails closed when a numeric field is a string instead of a number", () => {
    const raw = makeConstraints();
    const malformed = { ...raw, spend: { ...raw.spend, perTransactionCents: "10000" } };
    expect(parseConstraints(malformed)).toBeNull();
  });

  it("fails closed when a numeric field is a non-integer", () => {
    const raw = makeConstraints();
    const malformed = { ...raw, items: { ...raw.items, maxUnitPriceCents: 100.5 } };
    expect(parseConstraints(malformed)).toBeNull();
  });

  it("fails closed when a numeric field is negative", () => {
    const raw = makeConstraints();
    const malformed = { ...raw, spend: { ...raw.spend, perWindowCents: -1 } };
    expect(parseConstraints(malformed)).toBeNull();
  });

  it("fails closed when an allow/deny list contains a non-string entry", () => {
    const raw = makeConstraints();
    const malformed = { ...raw, merchants: { allow: [], deny: ["acme", 7] } };
    expect(parseConstraints(malformed)).toBeNull();
  });

  it("fails closed when a whole constraint section is missing", () => {
    const raw = makeConstraints() as unknown as Record<string, unknown>;
    const { escalation: _escalation, ...withoutEscalation } = raw;
    expect(parseConstraints(withoutEscalation)).toBeNull();
  });
});
