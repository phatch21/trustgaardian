// Runtime predicates local to /tokens. Deliberately not shared with
// /engine's validate.ts — /tokens imports only types from engine/types.ts.

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// byteLength is the expected number of underlying bytes (e.g. 32 for a
// SHA-256 digest, 64 for an Ed25519 signature) — the hex string is twice that.
export function isHex(value: unknown, byteLength: number): value is string {
  if (typeof value !== "string") return false;
  if (value.length !== byteLength * 2) return false;
  return /^[0-9a-f]+$/i.test(value);
}
