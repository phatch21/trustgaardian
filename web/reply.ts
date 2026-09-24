// Turns an OrchestratorResult into one or two sentences of assistant
// speech, per docs/demo-script.md's Alexa+ framing: the reply says what
// the assistant found and is proposing, never a data dump. The cart card
// carries the line items; this only ever produces prose.

import type { RuleResult } from "../engine/types.js";
import type { OrchestratorResult } from "../orchestrator/types.js";
import type { DisplayCart } from "./types.js";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function asCents(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function firstFailure(ruleResults: RuleResult[]): RuleResult | undefined {
  return ruleResults.find((rule) => !rule.passed);
}

function denyReasonClause(rule: RuleResult): string {
  switch (rule.ruleId) {
    case "transaction_cap":
      return `that comes to ${formatUsd(asCents(rule.observed))}, over your ${formatUsd(asCents(rule.limit))} limit`;
    case "deny_lists":
      return `one of those items isn't allowed under your current shopping rules`;
    case "item_limits":
      return `one item in that cart is outside your per-item limits`;
    case "grant_validity":
      return `your shopping grant isn't valid right now (${rule.reason})`;
    default:
      return `it didn't pass your shopping rules (${rule.ruleId})`;
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
  const total = formatUsd(cart?.totalCents ?? 0);

  if (result.decision.verdict === "allow") {
    return `I found ${itemCount} ${itemWord(itemCount)} for you, totaling ${total}. I've approved this cart and it's ready for checkout.`;
  }

  const failure = firstFailure(result.decision.ruleResults);
  const reasonClause = failure ? denyReasonClause(failure) : "it didn't pass your shopping rules";
  return `I put together ${itemCount} ${itemWord(itemCount)} for ${total}, but I can't approve it — ${reasonClause}.`;
}
