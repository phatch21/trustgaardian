# Friction log

Entries recorded during the hackathon window. Format per entry: task
attempted, steps taken, expected vs actual, severity, workaround, suggestion.

---

## 2026-09-23 — Document identifier not stable across tool responses

**Task attempted:** Edit a specific table cell in a working document created
earlier in the same session.

**Steps taken:** Reused the container identifier returned when the document
was created. Sent the edit.

**Expected:** The edit applies, as it had for six prior edits in the session.

**Actual:** Five consecutive rejections. The first was a legitimate content
error, but the following four returned a permission error rather than a
"document not found" error, which pointed at the wrong diagnosis and sent me
looking for an access problem that did not exist. The real cause was an
identifier mismatch between the creation response and the canonical link.

**Severity:** Medium. Not blocking, but roughly ten minutes lost to a
misleading error class.

**Workaround:** Listed artifacts to retrieve the canonical link, then used
that identifier. Worked on the first try.

**Suggestion:** Return "not found" rather than "forbidden" when an identifier
does not resolve. A permission error on a nonexistent resource is actively
misleading, and it is the kind of thing that costs real time under deadline.

## 2026-09-23 — Underspecified verifier semantics produced an unsatisfiable test plan

**Task attempted:** Write tamper-detection tests for the audit chain verifier
against a test plan naming three tamper types.

**Steps taken:** Implemented the verifier, then tried to map "tamper with a
payload," "tamper with an entry_hash directly," and "delete a middle row" onto
three distinct reason codes.

**Expected:** Three tamper actions, three reason codes.

**Actual:** Two of the three land on hash_mismatch. A lone entry_hash edit
cannot produce broken_link, because entry_hash is defined over its own row's
fields and self-consistency fails at that seq first. The broken_link branch
was unreachable by the plan as written and would have gone untested.

**Severity:** Low as a bug, medium as a process issue. No defect shipped, but
the spec said only that the verifier "reports the first break" without defining
the break classes, which is what let the bad test plan through.

**Workaround:** Added a fourth test forging prev_hash with a recomputed
entry_hash, which is the only way to exercise broken_link. Then wrote the
failure classes and their detection order into docs/spec.md.

**Suggestion:** Specify failure taxonomies before writing tests against them.
An error union with an unreachable variant is a design smell that a test plan
written from prose will not catch.

## 2026-09-23 — Compiled output silently drops the catalog fixture

**Task attempted:** Implement /catalog, loading fixtures from
catalog/fixtures/catalog.json via a path resolved relative to
import.meta.url.

**Steps taken:** Ran `npm run build`, then checked dist/catalog/fixtures/
for the compiled fixture path's counterpart.

**Expected:** Either the JSON file is copied alongside the compiled JS, or
the build fails loudly if it can't resolve the fixture.

**Actual:** `tsc` compiles only .ts files. dist/ has no fixtures/
directory at all. The build reports success. loadCatalog() run from
dist/catalog/load.js would throw ENOENT at runtime — a working build that
produces a broken artifact.

**Severity:** Not currently blocking — every real script (npm test,
seed, verify-chain) runs against source via vitest/tsx, and nothing
consumes dist/ yet. It becomes blocking the instant something does: a
"start" script that runs compiled output, or /web's dev server, whichever
lands first, is the piece that will hit it — and whoever's building /web
will hit it first if /web imports catalog through the same compiled path.

**Workaround:** None applied; deferred deliberately rather than expanding
this task's scope into build tooling.

**Suggestion:** Before /web or any "run from dist" path exists, add a
build step (postbuild script, or bundler asset handling) that copies
non-.ts assets into dist/ alongside the files that reference them, or
switch loadCatalog() to read via a project-root-relative path instead of
one relative to its own compiled location.
