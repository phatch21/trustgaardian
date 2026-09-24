// JSON shapes for /web's HTTP endpoints. See docs/demo-script.md for the
// beats these exist to render.

import type { AuditEntry } from "../audit/types.js";
import type { Decision, GrantConstraints } from "../engine/types.js";
import type { OrchestratorRejectionReason } from "../orchestrator/types.js";
import type { CheckoutResult } from "../checkout/types.js";
import type { ExecutionToken } from "../tokens/types.js";
import type { VerifyChainResult } from "../audit/types.js";

// Catalog title is looked up server-side and attached for display only —
// engine/types.ts's CartItem never carries it, and never should: /engine
// has no business reading listing text, titles included.
export interface DisplayCartItem {
  sku: string;
  title: string;
  merchant: string;
  category: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface DisplayCart {
  totalCents: number;
  items: DisplayCartItem[];
}

export interface UtteranceResponseBody {
  ok: boolean;
  reply: string;
  cart: DisplayCart | null;
  decision: Decision | null;
  token: ExecutionToken | null;
  reason?: OrchestratorRejectionReason;
  detail?: string;
}

export interface GrantSummaryResponse {
  grantId: string;
  agentId: string;
  constraints: GrantConstraints;
}

export interface AuditListResponse {
  entries: AuditEntry[];
}

// Demo-only checkout attempts reuse /checkout's own CheckoutResult, plus
// one reason that belongs to /web alone: the client sent a cartId this
// server has no record of, which can't happen via the normal conversation
// flow but is worth a clean response rather than a crash if it ever does.
export type DemoCheckoutResult = CheckoutResult | { ok: false; reason: "cart_not_found" };

export type TamperAuditResult = { ok: true; seq: number } | { ok: false; error: string };

export type VerifyChainResponse = VerifyChainResult;
