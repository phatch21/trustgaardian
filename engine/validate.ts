// Shared runtime predicates. Money is integer cents everywhere, so any
// numeric field that isn't a non-negative integer is untrustworthy input,
// not a value to coerce or round.

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
