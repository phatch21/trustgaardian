// Standalone CLI: opens the SQLite database, walks the audit chain via
// /audit's verifyChain, and prints the result in human-readable form.
// Exit code 0 on an intact chain, 1 on a detected break (or any other
// failure to verify) — safe to wire into CI.
//
//   npm run verify-chain [path/to/db]
//
// Defaults to data/trustgaardian.db, the path db/seed.ts creates. See
// docs/spec.md's "Verifier semantics" section for what each reason code
// means; REASON_EXPLANATIONS below says the same thing in CLI form, so
// keep the two in sync if either changes.
//
// Lives outside /audit deliberately: /audit's job is append and verify,
// not argv parsing, process.exit, or console formatting.

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type Database from "better-sqlite3";
import { verifyChain } from "../audit/index.js";
import type { ChainBreakReason } from "../audit/types.js";
import { openDb } from "../db/index.js";

const DEFAULT_DB_PATH = "data/trustgaardian.db";

const REASON_EXPLANATIONS: Record<ChainBreakReason, string> = {
  hash_mismatch:
    "this entry's own entry_hash no longer matches a fresh recomputation over its stored fields — something in that row was altered.",
  broken_link:
    "this entry's prev_hash does not match its predecessor's entry_hash — the link was forged or the chain was reordered.",
  seq_gap: "seq numbering skips a value here — an entry is missing, most likely deleted.",
};

export interface VerifyChainReport {
  ok: boolean;
  message: string;
}

export function buildReport(db: Database.Database): VerifyChainReport {
  try {
    const result = verifyChain(db);

    if (result.ok) {
      const { count } = db.prepare("SELECT COUNT(*) AS count FROM audit").get() as {
        count: number;
      };
      const head = db.prepare("SELECT entry_hash FROM audit ORDER BY seq DESC LIMIT 1").get() as
        | { entry_hash: string }
        | undefined;

      return {
        ok: true,
        message: [
          "OK: audit chain intact.",
          `  entries verified: ${count}`,
          `  head hash:        ${head?.entry_hash ?? "(none — chain is empty)"}`,
        ].join("\n"),
      };
    }

    return {
      ok: false,
      message: [
        `FAIL: audit chain broken at seq ${result.seq}.`,
        `  reason: ${result.reason}`,
        `  ${REASON_EXPLANATIONS[result.reason]}`,
      ].join("\n"),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `FAIL: could not verify the chain — ${detail}` };
  }
}

export function exitCodeFor(report: VerifyChainReport): 0 | 1 {
  return report.ok ? 0 : 1;
}

function main(): void {
  const dbPath = process.argv[2] ?? DEFAULT_DB_PATH;

  if (!existsSync(dbPath)) {
    console.error(`FAIL: no database at ${dbPath} — run \`npm run seed\` first, or pass a path.`);
    process.exit(1);
  }

  const db = openDb(dbPath);
  const report = buildReport(db);
  db.close();

  console.log(report.message);
  process.exit(exitCodeFor(report));
}

// Only run as a CLI when this file is executed directly, not when a test
// imports it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
