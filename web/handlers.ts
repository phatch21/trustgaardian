// The product-facing endpoint handlers: the conversation turn and the two
// read-only panels (active grant, audit log). Demo-only controls live in
// demo.ts instead, kept deliberately separate — see that file's header.

import { BedrockAgentClient } from "../agent/bedrock-client.js";
import { FixtureAgentClient } from "../agent/fixture-client.js";
import type { AgentClient } from "../agent/types.js";
import { listEntries } from "../audit/index.js";
import { DEMO_AGENT_ID, DEMO_GRANT_ID } from "../db/demo-grant.js";
import { parseConstraints } from "../engine/index.js";
import type { Cart } from "../engine/types.js";
import { runShoppingRequest } from "../orchestrator/index.js";
import type { OrchestratorResult } from "../orchestrator/index.js";
import { getCart, getGrant } from "../store/index.js";
import type { AppContext } from "./context.js";
import { buildAssistantReply, buildFalseComplianceReply, extractFalseComplianceClaim } from "./reply.js";
import { FALSE_COMPLIANCE_SCENARIO, selectScenario } from "./scenario.js";
import type { AuditListResponse, DisplayCart, GrantSummaryResponse, UtteranceResponseBody } from "./types.js";

function toDisplayCart(cart: Cart, catalog: AppContext["catalog"]): DisplayCart {
  const catalogBySku = new Map(catalog.map((item) => [item.sku, item]));
  return {
    totalCents: cart.totalCents,
    items: cart.items.map((item) => ({
      sku: item.sku,
      title: catalogBySku.get(item.sku)?.title ?? item.sku,
      merchant: item.merchant,
      category: item.category,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      lineTotalCents: item.unitPriceCents * item.quantity,
    })),
  };
}

export function getGrantSummary(ctx: AppContext): GrantSummaryResponse | null {
  const grant = getGrant(ctx.db, DEMO_GRANT_ID);
  if (grant === null) return null;

  const constraints = parseConstraints(grant.constraints);
  if (constraints === null) return null;

  return { grantId: grant.id, agentId: grant.agentId, constraints };
}

export function getAuditLog(ctx: AppContext): AuditListResponse {
  return { entries: listEntries(ctx.db) };
}

export interface HandleUtteranceOptions {
  live?: boolean;
  explicitScenario?: string;
}

export async function handleUtterance(
  ctx: AppContext,
  rawUtterance: string,
  options: HandleUtteranceOptions = {},
): Promise<UtteranceResponseBody> {
  const scenario = selectScenario(rawUtterance, options.explicitScenario);
  const agentClient: AgentClient = options.live ? new BedrockAgentClient() : new FixtureAgentClient(scenario);

  const result = await runShoppingRequest({
    db: ctx.db,
    grantId: DEMO_GRANT_ID,
    agentId: DEMO_AGENT_ID,
    rawUtterance,
    agentClient,
    catalog: ctx.catalog,
    privateKey: ctx.privateKey,
  });

  if (!result.ok) {
    return {
      ok: false,
      reply: buildAssistantReply(result, null),
      cart: null,
      decision: null,
      token: null,
      reason: result.reason,
      detail: result.detail,
    };
  }

  const persistedCart = getCart(ctx.db, result.decision.cartId);
  const displayCart = persistedCart ? toDisplayCart(persistedCart, ctx.catalog) : null;

  const reply = await buildReply(scenario, options, result, displayCart);

  return {
    ok: true,
    reply,
    cart: displayCart,
    decision: result.decision,
    token: result.token,
  };
}

// Builds the spoken reply for an evaluated request. The false-compliance
// scenario (see reply.ts) gets a special reply that quotes the model's own
// recorded claim instead of the honest one buildAssistantReply produces —
// scoped to this one scenario and offline only, never derived from a live
// call. FixtureAgentClient.complete() ignores its prompt argument entirely
// and just returns the recorded text, so calling it a second time here (to
// read the raw response for display) is a free, side-effect-free re-read,
// not a second real model call — that would only be true of a live client,
// which is exactly why this path is gated to !options.live.
async function buildReply(
  scenario: string,
  options: HandleUtteranceOptions,
  result: Extract<OrchestratorResult, { ok: true }>,
  displayCart: DisplayCart | null,
): Promise<string> {
  if (!options.live && scenario === FALSE_COMPLIANCE_SCENARIO) {
    const rawResponse = await new FixtureAgentClient(scenario).complete({ system: "", user: "" });
    const claim = extractFalseComplianceClaim(rawResponse);
    const capRule = result.decision.ruleResults.find((r) => r.ruleId === "transaction_cap");
    if (claim && typeof capRule?.limit === "number") {
      return buildFalseComplianceReply(claim, capRule.limit);
    }
  }

  return buildAssistantReply(result, displayCart);
}
