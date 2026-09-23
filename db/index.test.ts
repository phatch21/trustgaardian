import { describe, expect, it } from "vitest";
import { migrate, openDb } from "./index.js";

describe("db migrations", () => {
  it("creates the schema tables from docs/spec.md", () => {
    const db = openDb(":memory:");
    migrate(db);

    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);

    expect(tables).toEqual(["audit", "carts", "decisions", "grants", "requests", "tokens"]);

    db.close();
  });
});
