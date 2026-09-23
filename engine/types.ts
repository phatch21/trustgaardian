// Shared vocabulary for policy evaluation. Pure data shapes only — no I/O,
// no imports outside /engine. /tokens and /checkout import these types to
// talk about grants, carts and decisions without depending on engine
// internals. See docs/spec.md for the canonical schema these mirror.

export type Cents = number;

export type GrantStatus = "active" | "revoked" | "expired";

export interface SpendConstraint {
  perTransactionCents: Cents;
  perWindowCents: Cents;
  window: string;
  currency: string;
}

export interface MerchantConstraint {
  allow: string[];
  deny: string[];
}

export interface CategoryConstraint {
  allow: string[];
  deny: string[];
}

export interface FrequencyConstraint {
  maxPurchases: number;
  window: string;
}

export interface ItemConstraint {
  maxUnitPriceCents: Cents;
  maxQuantity: number;
}

export interface EscalationConstraint {
  requireApprovalAboveCents: Cents;
  autoDenyOn: string[];
}

export interface GrantConstraints {
  spend: SpendConstraint;
  merchants: MerchantConstraint;
  categories: CategoryConstraint;
  frequency: FrequencyConstraint;
  items: ItemConstraint;
  escalation: EscalationConstraint;
}

export interface Grant {
  id: string;
  userId: string;
  agentId: string;
  createdAt: string;
  expiresAt: string;
  status: GrantStatus;
  // Deserialized JSON (constraints_json), untrusted until parseConstraints
  // validates its shape. A hostile or corrupted grant record must fail
  // closed, not throw, so this stays unknown at the type level.
  constraints: unknown;
}

export interface CartItem {
  sku: string;
  merchant: string;
  unitPriceCents: Cents;
  quantity: number;
  category: string;
}

export interface Cart {
  id: string;
  requestId: string;
  items: CartItem[];
  totalCents: Cents;
  createdAt: string;
}

export type Verdict = "allow" | "deny" | "escalate";

export interface RuleResult {
  ruleId: string;
  passed: boolean;
  reason: string;
  observed: unknown;
  limit: unknown;
}

export interface Decision {
  id: string;
  cartId: string;
  verdict: Verdict;
  ruleResults: RuleResult[];
  evaluatedAt: string;
}
