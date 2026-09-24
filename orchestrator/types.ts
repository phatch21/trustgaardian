// Result and parameter shapes for runShoppingRequest. See run.ts's header
// comment for the flow this wires together.

import type { KeyObject } from "node:crypto";
import type Database from "better-sqlite3";
import type { AgentClient, CartRejectionReason } from "../agent/types.js";
import type { CatalogItem } from "../catalog/types.js";
import type { Decision } from "../engine/types.js";
import type { ExecutionToken } from "../tokens/types.js";

// grant_not_found is this module's own failure mode — it can happen before
// /agent is ever called. Every other rejection reason belongs to
// parseCartResponse (agent/parse.ts): a malformed or otherwise-rejected
// agent response fails here too, before /engine ever runs.
export type OrchestratorRejectionReason = "grant_not_found" | CartRejectionReason;

// ok:true always carries a Decision — /engine ran and rendered a verdict,
// with its full per-rule breakdown in decision.ruleResults regardless of
// which way it went. token is non-null exactly when decision.verdict is
// "allow"; deny and escalate carry the decision (so /web can render why)
// with no token, since none was issued. ok:false means /engine never ran
// at all: either the grant didn't exist, or the agent's response didn't
// parse into a proposable cart.
export type OrchestratorResult =
  | { ok: false; reason: OrchestratorRejectionReason; detail: string }
  | { ok: true; decision: Decision; token: ExecutionToken | null };

export interface RunShoppingRequestParams {
  db: Database.Database;
  grantId: string;
  agentId: string;
  rawUtterance: string;
  // Injected, per agent/types.ts's AgentClient seam — tests pass
  // FixtureAgentClient, a live demo passes BedrockAgentClient.
  agentClient: AgentClient;
  catalog: CatalogItem[];
  privateKey: KeyObject;
  // Optional so production callers can default to the real clock. When
  // supplied (as every test here does), this exact value is threaded
  // through every step below — see run.ts's header comment.
  now?: string;
}
