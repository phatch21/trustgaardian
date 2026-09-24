// npm run dev
//
// A small, dependency-free HTTP server: node:http routing plus static
// files, no framework. Static assets under web/public/ are plain HTML/CSS/
// JS, hand-written rather than compiled — the "no build step beyond tsc"
// constraint is about not needing webpack/vite/etc. for this server's own
// TypeScript, not about the few dozen lines of browser-side script also
// needing a compiler. `npm run dev` runs this file directly via tsx; there
// is nothing else to build first, only `npm run seed` to have run once
// against the same database path.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { loadCatalog } from "../catalog/index.js";
import { DEMO_GRANT_ID } from "../db/demo-grant.js";
import { openDb } from "../db/index.js";
import { getGrant } from "../store/index.js";
import { createAppContext } from "./context.js";
import {
  handleAgentMismatchCheckout,
  handleTamperAudit,
  handleTamperCartCheckout,
  handleVerifyChain,
} from "./demo.js";
import { getAuditLog, getGrantSummary, handleUtterance } from "./handlers.js";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "public");
const DB_PATH = process.env.TRUSTGAARDIAN_DB_PATH ?? "data/trustgaardian.db";
const PORT = Number(process.env.PORT ?? 3000);

const STATIC_FILES: Record<string, string> = {
  "/": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css",
};

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendStatic(res: ServerResponse, filename: string): void {
  try {
    const path = join(PUBLIC_DIR, filename);
    const contentType = CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) return {};
  const parsed: unknown = JSON.parse(raw);
  return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

// Opens the database and confirms it's actually usable — not just that
// openDb() didn't throw, but that migrations ran and the demo grant is
// there. better-sqlite3 throws synchronously if DB_PATH's directory
// doesn't exist at all (a fresh clone that hasn't been seeded yet), so
// that has to be caught here too, not just the later getGrant() call —
// npm run seed's mkdirSync is the only thing that creates data/.
function openSeededDb(): Database.Database {
  let db: Database.Database;
  try {
    db = openDb(DB_PATH);
  } catch {
    console.error(`No usable database at ${DB_PATH}. Run \`npm run seed\` first.`);
    process.exit(1);
  }

  let grant;
  try {
    grant = getGrant(db, DEMO_GRANT_ID);
  } catch {
    console.error(`Database at ${DB_PATH} exists but hasn't been migrated. Run \`npm run seed\` first.`);
    process.exit(1);
  }
  if (grant === null) {
    console.error(`Database at ${DB_PATH} has no demo grant. Run \`npm run seed\` first.`);
    process.exit(1);
  }

  return db;
}

function main(): void {
  const db = openSeededDb();
  const catalog = loadCatalog();
  const ctx = createAppContext(db, catalog);

  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
        const { pathname } = url;
        const method = req.method ?? "GET";

        if (method === "GET" && pathname in STATIC_FILES) {
          const file = STATIC_FILES[pathname];
          if (file) sendStatic(res, file);
          return;
        }

        if (method === "GET" && pathname === "/api/grant") {
          const summary = getGrantSummary(ctx);
          sendJson(res, summary ? 200 : 500, summary ?? { error: "grant unavailable" });
          return;
        }

        if (method === "POST" && pathname === "/api/utterance") {
          const body = await readJsonBody(req);
          if (typeof body.text !== "string" || body.text.trim().length === 0) {
            sendJson(res, 400, { error: "text is required" });
            return;
          }
          const live = url.searchParams.get("live") === "1" || ctx.defaultLive;
          const result = await handleUtterance(ctx, body.text, {
            live,
            explicitScenario: typeof body.scenario === "string" ? body.scenario : undefined,
          });
          sendJson(res, 200, result);
          return;
        }

        if (method === "GET" && pathname === "/api/audit") {
          sendJson(res, 200, getAuditLog(ctx));
          return;
        }

        if (method === "POST" && pathname === "/api/demo/tamper-checkout") {
          const body = await readJsonBody(req);
          if (typeof body.cartId !== "string" || body.token === undefined) {
            sendJson(res, 400, { error: "cartId and token are required" });
            return;
          }
          sendJson(res, 200, handleTamperCartCheckout(ctx, body.cartId, body.token));
          return;
        }

        if (method === "POST" && pathname === "/api/demo/agent-mismatch-checkout") {
          const body = await readJsonBody(req);
          if (typeof body.cartId !== "string" || body.token === undefined) {
            sendJson(res, 400, { error: "cartId and token are required" });
            return;
          }
          sendJson(res, 200, handleAgentMismatchCheckout(ctx, body.cartId, body.token));
          return;
        }

        if (method === "POST" && pathname === "/api/demo/tamper-audit") {
          const body = await readJsonBody(req);
          if (typeof body.seq !== "number") {
            sendJson(res, 400, { error: "seq is required" });
            return;
          }
          sendJson(res, 200, handleTamperAudit(ctx, body.seq));
          return;
        }

        if (method === "POST" && pathname === "/api/demo/verify-chain") {
          sendJson(res, 200, handleVerifyChain(ctx));
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      } catch (error) {
        console.error(error);
        sendJson(res, 500, { error: "internal error" });
      }
    })();
  });

  server.listen(PORT, () => {
    console.log(`TrustGaardian demo running at http://localhost:${PORT} (agent mode: ${ctx.defaultLive ? "live" : "offline"})`);
  });
}

main();
