// Policy evaluation. Pure functions only — no network, no database, and it
// never reads merchant listing text. See docs/spec.md and docs/threat-model.md.

export * from "./types.js";
export * from "./constraints.js";
export * from "./rules.js";
export * from "./evaluate.js";
