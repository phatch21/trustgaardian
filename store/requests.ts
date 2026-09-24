// SQL for the requests table.

import type Database from "better-sqlite3";
import type { Request } from "./types.js";

interface RequestRow {
  id: string;
  grant_id: string;
  raw_utterance: string;
  structured_json: string;
  created_at: string;
}

function rowToRequest(row: RequestRow): Request {
  return {
    id: row.id,
    grantId: row.grant_id,
    rawUtterance: row.raw_utterance,
    structured: JSON.parse(row.structured_json),
    createdAt: row.created_at,
  };
}

export function createRequest(db: Database.Database, request: Request): void {
  db.prepare(
    `INSERT INTO requests (id, grant_id, raw_utterance, structured_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    request.id,
    request.grantId,
    request.rawUtterance,
    JSON.stringify(request.structured),
    request.createdAt,
  );
}

export function getRequest(db: Database.Database, id: string): Request | null {
  const row = db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as RequestRow | undefined;
  return row === undefined ? null : rowToRequest(row);
}
