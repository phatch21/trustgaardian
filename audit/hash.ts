// Pure hashing logic for the audit chain. No I/O, no database — takes
// field values in and returns strings, so it's testable without opening a
// connection.
//
// computeEntryHash mirrors tokens/canonicalize.ts's field-framing scheme:
// each of the five inputs is length-prefixed as `<byte-length>:<value>`
// before concatenation, not joined with a delimiter character, so no
// field's content (actor names, event payload hashes, etc.) can be crafted
// to shift where one field ends and the next begins.
//
// canonicalizePayload is a different problem: payloads are arbitrary
// JSON-shaped event data (a Grant, a Decision, a checkout result, ...),
// not five fixed scalar fields, so it recursively sorts object keys by
// UTF-8 byte value and then leverages JSON.stringify's own escaping rules
// (which already make every structural boundary unambiguous — a `"` or
// `{` inside a string is escaped, not literal) rather than reimplementing
// length-prefixing for an open-ended recursive shape.

import { createHash } from "node:crypto";

export const GENESIS_PREV_HASH = "0".repeat(64);

function field(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}

function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort(compareBytes)) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalizePayload(payload: unknown): string {
  return JSON.stringify(sortKeysDeep(payload));
}

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(canonicalizePayload(payload), "utf8").digest("hex");
}

export function computeEntryHash(
  prevHash: string,
  timestamp: string,
  actor: string,
  eventType: string,
  payloadHashValue: string,
): string {
  const canonical =
    field(prevHash) + field(timestamp) + field(actor) + field(eventType) + field(payloadHashValue);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
