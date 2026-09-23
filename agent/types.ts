// Shared vocabulary for /agent. AgentClient is the one seam between this
// module and any real model provider — everything else in /agent depends
// on the interface, never on Bedrock directly, so the whole module is
// testable offline via FixtureAgentClient.

import type { CartItem } from "../engine/types.js";

export interface AgentPrompt {
  system: string;
  user: string;
}

export interface AgentClient {
  complete(prompt: AgentPrompt): Promise<string>;
}

export interface ProposedCart {
  items: CartItem[];
  totalCents: number;
}

// Every reason parseCartResponse can reject for. See parse.ts for what
// each one means and why the price/merchant/category defense in
// particular is deliberate, not incidental.
export type CartRejectionReason =
  | "invalid_json"
  | "missing_fields"
  | "non_integer_price"
  | "unknown_sku"
  | "invalid_quantity";

export type ParseCartResult =
  | { ok: true; cart: ProposedCart }
  | { ok: false; reason: CartRejectionReason; detail: string };
