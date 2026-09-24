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
import { getCart, getGrant } from "../store/index.js";
import type { AppContext } from "./context.js";
import { buildAssistantReply } from "./reply.js";
import { selectScenario } from "./scenario.js";
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
  const agentClient: AgentClient = options.live
    ? new BedrockAgentClient()
    : new FixtureAgentClient(selectScenario(rawUtterance, options.explicitScenario));

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

  return {
    ok: true,
    reply: buildAssistantReply(result, displayCart),
    cart: displayCart,
    decision: result.decision,
    token: result.token,
  };
}
