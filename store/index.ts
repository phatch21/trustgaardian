// Persistence for Grants, Requests, Carts, and Decisions. This is the only
// place in the codebase (besides /audit's own table and /tokens' via
// checkout/persist.ts) that prepares SQL against these tables — every other
// module reaches a persisted object through the functions exported here
// instead of writing its own statements. Read functions return null for a
// missing row rather than throwing; a row that exists but fails to parse
// (corrupt JSON in a column this codebase itself wrote) is a genuine bug,
// not untrusted input, so that case is allowed to throw rather than being
// swallowed into a fail-closed null.

export * from "./types.js";
export * from "./grants.js";
export * from "./requests.js";
export * from "./carts.js";
export * from "./decisions.js";
