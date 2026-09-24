// SQL for the grants table. Every other module reaches a persisted Grant
// through getGrant() rather than preparing its own statements — see this
// directory's header comment in index.ts.

import type Database from "better-sqlite3";
import type { Grant, GrantStatus } from "../engine/types.js";

interface GrantRow {
  id: string;
  user_id: string;
  agent_id: string;
  created_at: string;
  expires_at: string;
  status: string;
  constraints_json: string;
}

function rowToGrant(row: GrantRow): Grant {
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status as GrantStatus,
    constraints: JSON.parse(row.constraints_json),
  };
}

export function createGrant(db: Database.Database, grant: Grant): void {
  db.prepare(
    `INSERT INTO grants (id, user_id, agent_id, created_at, expires_at, status, constraints_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    grant.id,
    grant.userId,
    grant.agentId,
    grant.createdAt,
    grant.expiresAt,
    grant.status,
    JSON.stringify(grant.constraints),
  );
}

export function getGrant(db: Database.Database, id: string): Grant | null {
  const row = db.prepare("SELECT * FROM grants WHERE id = ?").get(id) as GrantRow | undefined;
  return row === undefined ? null : rowToGrant(row);
}
