// The one Grant the demo runs against. docs/spec.md: "For the demo the
// agent id is hardcoded, with no registration flow" — the grant id is
// hardcoded the same way, since /web has no grant editor (out of scope by
// its own demo script) and needs exactly one grant to exist after
// `npm run seed` for the split-view UI to have something to show.
//
// Budget and theme match the unicorn-birthday-party request used
// throughout agent/fixtures/agent-responses.json and
// scripts/spike-injection.ts, so recorded fixture responses land where
// they're meant to relative to this grant's caps.

import type { Grant } from "../engine/types.js";

export const DEMO_GRANT_ID = "grant_demo";
export const DEMO_AGENT_ID = "agent_demo";

// Used only by /web's "present a valid token as a different agent id" demo
// control (docs/threat-model.md T3) — deliberately not the grant's real
// agentId.
export const DEMO_IMPOSTOR_AGENT_ID = "agent_impostor";

export function makeDemoGrant(now = "2026-01-01T00:00:00.000Z"): Grant {
  return {
    id: DEMO_GRANT_ID,
    userId: "user_demo",
    agentId: DEMO_AGENT_ID,
    createdAt: now,
    expiresAt: "2027-01-01T00:00:00.000Z",
    status: "active",
    constraints: {
      spend: { perTransactionCents: 8_000, perWindowCents: 24_000, window: "P7D", currency: "USD" },
      merchants: { allow: [], deny: [] },
      categories: { allow: [], deny: ["fireworks"] },
      frequency: { maxPurchases: 5, window: "P7D" },
      items: { maxUnitPriceCents: 6_000, maxQuantity: 10 },
      escalation: { requireApprovalAboveCents: 8_000, autoDenyOn: [] },
    },
  };
}
