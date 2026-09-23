// Shapes for the hash-chained audit log. See docs/spec.md's audit chain
// section for entry_hash's construction and the events list.

export type EventType =
  | "grant_created"
  | "request_received"
  | "cart_proposed"
  | "decision_rendered"
  | "token_issued"
  | "checkout_attempted"
  | "checkout_result";

export interface AuditEntry {
  seq: number;
  prevHash: string;
  timestamp: string;
  actor: string;
  eventType: EventType;
  payloadHash: string;
  entryHash: string;
}

// Three distinct ways a chain can fail to verify, each caught at a
// different check so they can't be confused for one another:
//   hash_mismatch  — this entry's own entry_hash doesn't match a fresh
//                    recomputation from its own stored fields.
//   broken_link    — this entry's stored prev_hash doesn't match the
//                    previous entry's (verified) entry_hash, even though
//                    this entry is internally self-consistent.
//   seq_gap        — the seq sequence isn't contiguous from 1; an entry is
//                    missing.
export type ChainBreakReason = "hash_mismatch" | "broken_link" | "seq_gap";

export type VerifyChainResult = { ok: true } | { ok: false; seq: number; reason: ChainBreakReason };
