// Request: the one object from docs/spec.md's schema that has no home in
// any existing pure module. /engine's rules never read it — the spend cap
// it checks comes from Grant.constraints, not Request — so it doesn't
// belong in engine/types.ts alongside Grant, Cart, and Decision. It's
// defined here because /store is the first module that needs to name its
// shape in order to persist it.
//
// structured mirrors docs/spec.md's schema (goal, qualifiers, budget,
// deadline), but nothing in this codebase populates it yet: there is no
// NLU step that extracts structure from raw_utterance. /orchestrator passes
// rawUtterance straight through to /agent's buildPrompt() and leaves
// structured null. The field exists so this type doesn't diverge from the
// documented schema, not because anything reads it today.

export interface RequestStructured {
  goal: string;
  qualifiers: string[];
  budgetCents: number | null;
  deadline: string | null;
}

export interface Request {
  id: string;
  grantId: string;
  rawUtterance: string;
  structured: RequestStructured | null;
  createdAt: string;
}
