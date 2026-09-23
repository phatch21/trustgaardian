// Rules 1-4 from docs/spec.md's evaluation order. Each rule is a pure
// function returning exactly one RuleResult. Rules 2-4 depend on parsed
// grant constraints; when constraints failed to parse, every one of them
// fails closed with the same reason rather than throwing or being skipped.

import { isNonNegativeInteger } from "./validate.js";
import type { Cart, Grant, GrantConstraints, RuleResult } from "./types.js";

export function ruleGrantValidity(grant: Grant, agentId: string, now: string): RuleResult {
  const ruleId = "grant_validity";

  if (grant.status !== "active") {
    return {
      ruleId,
      passed: false,
      reason: "grant_not_active",
      observed: grant.status,
      limit: "active",
    };
  }

  const expiresAtMs = Date.parse(grant.expiresAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(expiresAtMs) || Number.isNaN(nowMs)) {
    return {
      ruleId,
      passed: false,
      reason: "unparseable_timestamp",
      observed: { expiresAt: grant.expiresAt, now },
      limit: null,
    };
  }
  if (nowMs > expiresAtMs) {
    return {
      ruleId,
      passed: false,
      reason: "grant_expired",
      observed: grant.expiresAt,
      limit: now,
    };
  }

  if (grant.agentId !== agentId) {
    return {
      ruleId,
      passed: false,
      reason: "agent_mismatch",
      observed: agentId,
      limit: grant.agentId,
    };
  }

  return {
    ruleId,
    passed: true,
    reason: "ok",
    observed: { status: grant.status, agentId: grant.agentId },
    limit: null,
  };
}

export function ruleDenyLists(cart: Cart, constraints: GrantConstraints | null): RuleResult {
  const ruleId = "deny_lists";
  if (constraints === null) {
    return { ruleId, passed: false, reason: "unparseable_constraints", observed: null, limit: null };
  }

  for (const item of cart.items) {
    if (constraints.merchants.deny.includes(item.merchant)) {
      return {
        ruleId,
        passed: false,
        reason: "merchant_denied",
        observed: item.merchant,
        limit: constraints.merchants.deny,
      };
    }
    if (
      constraints.merchants.allow.length > 0 &&
      !constraints.merchants.allow.includes(item.merchant)
    ) {
      return {
        ruleId,
        passed: false,
        reason: "merchant_not_allowed",
        observed: item.merchant,
        limit: constraints.merchants.allow,
      };
    }
    if (constraints.categories.deny.includes(item.category)) {
      return {
        ruleId,
        passed: false,
        reason: "category_denied",
        observed: item.category,
        limit: constraints.categories.deny,
      };
    }
    if (
      constraints.categories.allow.length > 0 &&
      !constraints.categories.allow.includes(item.category)
    ) {
      return {
        ruleId,
        passed: false,
        reason: "category_not_allowed",
        observed: item.category,
        limit: constraints.categories.allow,
      };
    }
  }

  return { ruleId, passed: true, reason: "ok", observed: null, limit: null };
}

export function ruleItemLimits(cart: Cart, constraints: GrantConstraints | null): RuleResult {
  const ruleId = "item_limits";
  if (constraints === null) {
    return { ruleId, passed: false, reason: "unparseable_constraints", observed: null, limit: null };
  }

  for (const item of cart.items) {
    if (!isNonNegativeInteger(item.unitPriceCents) || !isNonNegativeInteger(item.quantity)) {
      return {
        ruleId,
        passed: false,
        reason: "unparseable_item",
        observed: { sku: item.sku, unitPriceCents: item.unitPriceCents, quantity: item.quantity },
        limit: null,
      };
    }
    if (item.unitPriceCents > constraints.items.maxUnitPriceCents) {
      return {
        ruleId,
        passed: false,
        reason: "unit_price_exceeds_limit",
        observed: item.unitPriceCents,
        limit: constraints.items.maxUnitPriceCents,
      };
    }
    if (item.quantity > constraints.items.maxQuantity) {
      return {
        ruleId,
        passed: false,
        reason: "quantity_exceeds_limit",
        observed: item.quantity,
        limit: constraints.items.maxQuantity,
      };
    }
  }

  return { ruleId, passed: true, reason: "ok", observed: null, limit: null };
}

export function ruleTransactionCap(cart: Cart, constraints: GrantConstraints | null): RuleResult {
  const ruleId = "transaction_cap";
  if (constraints === null) {
    return { ruleId, passed: false, reason: "unparseable_constraints", observed: null, limit: null };
  }

  if (!isNonNegativeInteger(cart.totalCents)) {
    return {
      ruleId,
      passed: false,
      reason: "unparseable_cart_total",
      observed: cart.totalCents,
      limit: null,
    };
  }

  if (cart.totalCents > constraints.spend.perTransactionCents) {
    return {
      ruleId,
      passed: false,
      reason: "cart_total_exceeds_transaction_cap",
      observed: cart.totalCents,
      limit: constraints.spend.perTransactionCents,
    };
  }

  return {
    ruleId,
    passed: true,
    reason: "ok",
    observed: cart.totalCents,
    limit: constraints.spend.perTransactionCents,
  };
}
