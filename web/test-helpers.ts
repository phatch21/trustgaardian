// Fixture builder for /web tests only.

import { migrate, openDb } from "../db/index.js";
import { makeDemoGrant } from "../db/demo-grant.js";
import { loadCatalog } from "../catalog/index.js";
import { createGrant } from "../store/index.js";
import { createAppContext, type AppContext } from "./context.js";

// seedGrant defaults true: most tests need the demo grant to exist. Pass
// false for the one test that exercises the grant_not_found path.
export function makeTestContext(options: { seedGrant?: boolean } = {}): AppContext {
  const db = openDb(":memory:");
  migrate(db);
  if (options.seedGrant ?? true) {
    createGrant(db, makeDemoGrant());
  }
  return createAppContext(db, loadCatalog());
}
