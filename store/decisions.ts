// SQL for the decisions table.

import type Database from "better-sqlite3";
import type { Decision, Verdict } from "../engine/types.js";

interface DecisionRow {
  id: string;
  cart_id: string;
  verdict: string;
  rule_results_json: string;
  evaluated_at: string;
}

function rowToDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    cartId: row.cart_id,
    verdict: row.verdict as Verdict,
    ruleResults: JSON.parse(row.rule_results_json),
    evaluatedAt: row.evaluated_at,
  };
}

export function createDecision(db: Database.Database, decision: Decision): void {
  db.prepare(
    `INSERT INTO decisions (id, cart_id, verdict, rule_results_json, evaluated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    decision.id,
    decision.cartId,
    decision.verdict,
    JSON.stringify(decision.ruleResults),
    decision.evaluatedAt,
  );
}

export function getDecision(db: Database.Database, id: string): Decision | null {
  const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as DecisionRow | undefined;
  return row === undefined ? null : rowToDecision(row);
}
