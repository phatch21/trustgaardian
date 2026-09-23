// Orchestrates rules 1-4 against one grant and one proposed cart. All rules
// run regardless of earlier failures, so the audit trail and the UI show
// the complete picture rather than the first tripwire. Verdict is "deny"
// unless every rule passes — "allow" is the only other verdict rules 1-4
// can produce; "escalate" arrives with rule 7, not implemented here.
//
// Pure: id and evaluatedAt are supplied by the caller rather than generated
// here, so evaluate() has no hidden clock or randomness.

import { parseConstraints } from "./constraints.js";
import { ruleDenyLists, ruleGrantValidity, ruleItemLimits, ruleTransactionCap } from "./rules.js";
import type { Cart, Decision, Grant, RuleResult } from "./types.js";

export interface EvaluateParams {
  id: string;
  grant: Grant;
  cart: Cart;
  agentId: string;
  evaluatedAt: string;
}

export function evaluate(params: EvaluateParams): Decision {
  const { id, grant, cart, agentId, evaluatedAt } = params;
  const constraints = parseConstraints(grant.constraints);

  const ruleResults: RuleResult[] = [
    ruleGrantValidity(grant, agentId, evaluatedAt),
    ruleDenyLists(cart, constraints),
    ruleItemLimits(cart, constraints),
    ruleTransactionCap(cart, constraints),
  ];

  const verdict = ruleResults.every((result) => result.passed) ? "allow" : "deny";

  return { id, cartId: cart.id, verdict, ruleResults, evaluatedAt };
}
