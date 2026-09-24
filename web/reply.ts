// Turns an OrchestratorResult into one or two sentences of assistant
// speech, per docs/demo-script.md's Alexa+ framing: the reply says what
// the assistant found and is proposing, never a data dump. The cart card
// carries the line items; this only ever produces prose.

import type { RuleResult } from "../engine/types.js";
import type { OrchestratorResult } from "../orchestrator/types.js";
import type { DisplayCart } from "./types.js";

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function asCents(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function firstFailure(ruleResults: RuleResult[]): RuleResult | undefined {
  return ruleResults.find((rule) => !rule.passed);
}

// Full sentences, not clauses — buildAssistantReply says what happened
// once, then this says why, as its own sentence. Never repeats a figure
// buildAssistantReply already said.
function denyReasonSentence(rule: RuleResult): string {
  switch (rule.ruleId) {
    case "transaction_cap":
      return `That's ${formatUsd(asCents(rule.observed))}, over your ${formatUsd(asCents(rule.limit))} limit.`;
    case "deny_lists":
      return "One of those items isn't allowed under your current shopping rules.";
    case "item_limits":
      return "One item in that cart is outside your per-item limits.";
    case "grant_validity":
      return `Your shopping grant isn't valid right now (${rule.reason}).`;
    default:
      return `It didn't pass your shopping rules (${rule.ruleId}).`;
  }
}

function itemWord(count: number): string {
  return count === 1 ? "item" : "items";
}

export function buildAssistantReply(result: OrchestratorResult, cart: DisplayCart | null): string {
  if (!result.ok) {
    if (result.reason === "grant_not_found") {
      return "I couldn't find your shopping grant, so I can't help with that right now.";
    }
    return `I had trouble putting a cart together for that — ${result.detail} Could you try rephrasing it?`;
  }

  const itemCount = cart?.items.length ?? 0;

  if (result.decision.verdict === "allow") {
    const total = formatUsd(cart?.totalCents ?? 0);
    return `I found ${itemCount} ${itemWord(itemCount)} for you, totaling ${total}. I've approved this cart and it's ready for checkout.`;
  }

  const failure = firstFailure(result.decision.ruleResults);
  const reasonSentence = failure ? denyReasonSentence(failure) : "It didn't pass your shopping rules.";
  return `I put together ${itemCount} ${itemWord(itemCount)}, but I can't approve it. ${reasonSentence}`;
}

// --- The false-compliance demo beat (docs/demo-script.md) ---
//
// The assistant states the model's own recorded claim confidently and
// verbatim — no hedge, no self-correction — while the policy panel
// independently renders the real denial computed from the true catalog
// total. The contradiction between what's said and what the panel shows
// *is* the beat; softening the reply here would erase it.

export interface FalseComplianceClaim {
  itemCount: number;
  claimedTotalCents: number;
}

// Reads the model's own self-reported item count and total straight out
// of its raw recorded response — the same total_cents parseCartResponse
// (agent/parse.ts) deliberately discards everywhere else in this codebase.
// Using it here, once, for display only, in a reply that never reaches
// /engine, doesn't weaken that defense; nothing downstream of /engine ever
// sees this value.
export function extractFalseComplianceClaim(rawResponse: string): FalseComplianceClaim | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { items, total_cents: totalCents } = parsed as { items?: unknown; total_cents?: unknown };
  if (!Array.isArray(items) || typeof totalCents !== "number") return null;

  return { itemCount: items.length, claimedTotalCents: totalCents };
}

export function buildFalseComplianceReply(claim: FalseComplianceClaim, budgetLimitCents: number): string {
  return `I found ${claim.itemCount} ${itemWord(claim.itemCount)} for ${formatUsd(claim.claimedTotalCents)}, well under your ${formatUsd(budgetLimitCents)} budget.`;
}
