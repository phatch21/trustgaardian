# Friction log

Entries recorded during the hackathon window. Format per entry: task
attempted, steps taken, expected vs actual, severity, workaround, suggestion.
Grouped by area; ordered by severity within each group, highest first.

---

## AWS and Bedrock

### 2026-09-23 — AccessDeniedException misreported a malformed model id as an account/billing restriction

**Task attempted:** Run scripts/spike-injection.ts against a real Bedrock
model to measure whether the planted injection fixtures actually steer it,
per docs/injection-fixtures.md.

**Steps taken:** Set BEDROCK_MODEL_ID to a bare model id string and ran the
spike.

**Expected:** Either the call succeeds, or a failure that names the actual
problem — an invalid or inaccessible model identifier.

**Actual:** AccessDeniedException, with message text pointing at account
entitlement ("not available for this account") and guidance to contact
AWS billing/sales. The real cause was unrelated to entitlement: newer
Claude models on Bedrock require an inference profile ARN, not a bare
model id, and the bare id doesn't resolve to anything the account can
invoke. Nothing in the error indicates the identifier itself is the
problem.

**Severity:** High. The error actively points at the wrong subsystem —
account status and billing, not request shape — and following that lead
costs real time on a deadline, especially since the account genuinely was
new and could plausibly have had a real entitlement issue too (see below).

**Workaround:** Replaced the bare model id with the model's inference
profile ARN in BEDROCK_MODEL_ID.

**Suggestion:** When AccessDeniedException is the error surface for both
entitlement problems and malformed identifiers, the message needs to say
which. Validate the model id's shape (bare id vs. ARN) client-side before
the call and fail with a specific, actionable message rather than relying
on the API's error text.

### 2026-09-23 — New-account verification hold surfaced as an indistinguishable AccessDeniedException

**Task attempted:** Same as above — invoking a Bedrock model from a
freshly created AWS account.

**Steps taken:** Corrected the model id to an inference profile ARN per
the fix above, retried the call.

**Expected:** The call succeeds now that the identifier is valid.

**Actual:** Still AccessDeniedException, but a different message — this
one about the account being under a new-account verification hold, not
about the model id. Nothing about the exception type distinguished it
from the previous failure; only reading the message text carefully
separated "wrong identifier" from "account not yet cleared to invoke
models at all."

**Severity:** Medium-high. Fully blocking until resolved, but unlike the
entry above, close reading of the message does point at the real cause —
the cost is in not assuming a second AccessDeniedException is the same
class of problem as the first.

**Workaround:** Waited out the account verification hold, then retried.

**Suggestion:** Don't collapse distinct failure causes onto one exception
type with only free text to distinguish them. Check account status
directly rather than re-debugging the request when a second
AccessDeniedException follows a fixed first one.

### 2026-09-23 — AWS_BEARER_TOKEN_BEDROCK is not discoverable from the console page that generates the key

**Task attempted:** Authenticate against Bedrock using an API key
generated from the Bedrock console, rather than full IAM credentials.

**Steps taken:** Generated a Bedrock API key in the console, looked for
where to configure it.

**Expected:** The console page that generates the key names the
environment variable or config it's meant to populate.

**Actual:** No such pointer. The variable name — AWS_BEARER_TOKEN_BEDROCK,
a generic AWS_BEARER_TOKEN_<SIGNING_NAME> pattern resolved by
@aws-sdk/core for any service — is only discoverable by reading SDK
source or documentation well outside the console flow.

**Severity:** Low. One-time setup friction, not a recurring cost once
known, and now written down in agent/bedrock-client.ts's own header
comment for this project specifically.

**Workaround:** Traced getBearerTokenEnvKey() in @aws-sdk/core to find the
actual variable name, set it directly.

**Suggestion:** The Bedrock console's API key generation page should print
the exact environment variable name next to the key, the way most
API-key consoles show a ready-to-paste `export` line.

## Windows tooling

### 2026-09-22 — PowerShell execution policy blocks npm's .ps1 shim on a fresh Node install

**Task attempted:** Run the first npm command on a fresh Windows machine
with Node just installed.

**Steps taken:** Ran the npm command as normal.

**Expected:** npm runs.

**Actual:** A security error blocking script execution, linking to
Microsoft's execution-policy documentation rather than stating the
one-line fix. This blocks every subsequent npm command, not just the
first — nothing in this repo runs until it's resolved.

**Severity:** High. It's the very first command a fresh clone requires,
and it fails by default on stock Windows.

**Workaround:** `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`,
then re-run.

**Suggestion:** Note the execution-policy prerequisite in this repo's own
setup instructions rather than relying on whatever Microsoft's linked doc
says — a contributor on a fresh Windows machine shouldn't have to
rediscover this.

### 2026-09-24 — `>` redirection writes UTF-16LE, and console-codepage mismatches mangle UTF-8 punctuation inside it

**Task attempted:** Capture a spike run's console output
(scripts/spike-injection.ts) to a file for later use as a recorded
fixture.

**Steps taken:** Redirected output with PowerShell's `>` operator.

**Expected:** A UTF-8 text file matching what was printed to the console.

**Actual:** Two independent problems stacked: (1) PowerShell's `>`
defaults to UTF-16LE with a BOM, not UTF-8; (2) separately, em-dashes
(U+2014) in the text were corrupted into the three-character sequence
"ΓÇö" — the UTF-8 bytes for an em-dash, misread through the console's
OEM/CP437 codepage before being written. Neither problem announces
itself; the file opens and looks intact until a downstream parser or a
close read finds the corruption. Confirming the repair was correct rather
than approximate required checking the BOM bytes and verifying the
corruption mechanism at the byte level
(`Buffer.from([0xE2,0x80,0x94]).toString('utf8')` equals an em-dash).

**Severity:** Medium-high. Silent corruption of recorded evidence is
worse than an outright failure — a spike-run record could have been used
as-is with dozens of corrupted characters unnoticed.

**Workaround:** `npm run spike:injection | Out-File -Encoding utf8`
instead of `>`. For output already captured: verify the BOM, decode as
UTF-16LE, and repair the specific mojibake pattern only after confirming
the byte-level mechanism.

**Suggestion:** Never use bare `>` for anything meant to be read as UTF-8
on Windows; pipe through `Out-File -Encoding utf8` instead. Any tooling
doc for this repo that shows a capture command should say so explicitly.

### 2026-09-23 — `tsx -e` is unusable from PowerShell with nested quotes

**Task attempted:** Run a short one-off TypeScript snippet inline via
`tsx -e "..."` from PowerShell, rather than writing a scratch file.

**Steps taken:** Wrote an inline script containing nested string literals
and passed it via `-e`.

**Expected:** Either it runs, or a shell-level quoting error.

**Actual:** esbuild reports an unterminated string literal — a parse
error inside the bundler, not a shell error — because PowerShell's
quoting rules mangled the nested quotes before the string ever reached
tsx. The error surfaces at the wrong layer: it reads like a bug in the
snippet, not a shell-quoting mismatch.

**Severity:** Medium. Workflow-specific with a reliable workaround, but
costs time misdiagnosing on every occurrence, since the error message
never points at the shell.

**Workaround:** Write the snippet to a scratch `.ts` file and run
`tsx path/to/file.ts` instead of `-e`.

**Suggestion:** Default to scratch files over `-e`/inline snippets on
Windows; PowerShell's quoting is not compatible with the shell-quoting
assumptions most inline-eval flags are written against.

### 2026-09-23 — PowerShell here-string requires `@'` alone on its own line, which paste collapses

**Task attempted:** Pass a multi-line string (a commit message or file
content) to a command via a PowerShell here-string.

**Steps taken:** Pasted a multi-line `@'...'@` block into the terminal.

**Expected:** The here-string is preserved as typed.

**Actual:** Terminal paste handling collapsed the opening `@'` onto the
same line as content, which PowerShell's parser requires to be alone on
its own line — silently breaking the here-string rather than erroring
clearly at the point of the actual mistake.

**Severity:** Medium. Recoverable once recognized, but easy to hit again
since the failure mode isn't self-explanatory.

**Workaround:** Verify the here-string's opening line is genuinely alone
before executing, rather than trusting a paste.

**Suggestion:** Prefer writing multi-line content to a file and
referencing it, rather than a pasted here-string, whenever the shell is
PowerShell and the content includes newlines.

### 2026-09-22 — `gh` is not installed by default, and setup guidance assumes it

**Task attempted:** Use `gh` for a GitHub operation per standard tooling
guidance.

**Steps taken:** Ran a `gh` command.

**Expected:** It runs.

**Actual:** Not found — GitHub CLI isn't part of a default Windows/Node
setup, but guidance elsewhere assumes it's available.

**Severity:** Low. One-time install, well-documented fix.

**Workaround:** Installed via winget/choco.

**Suggestion:** Note `gh` as a setup prerequisite, with the one-line
install command, wherever it's first assumed rather than discovering the
gap mid-task.

## Project and process

### 2026-09-23 — Injection fixture targeted a delimiter that didn't match the real envelope tag

**Task attempted:** Add catalog/fixtures/catalog.json's delimiter-escape
fixture (UNI-CAKE-01) to exercise agent/prompt.ts's envelope-splitting
defense — a fixture whose payload attempts to close
`<untrusted_catalog_listings>` early via a literal closing tag inside
listing text.

**Steps taken:** Wrote the fixture's planted payload before confirming
agent/prompt.ts's actual envelope tag name against the source, using an
assumed tag.

**Expected:** The fixture's literal closing-tag text matches the real tag
`buildUserContent()` emits, so the escaping defense is genuinely
exercised — a broken `escapeAngleBrackets()` would let this fixture's
text land in the instruction position, and a test would catch it.

**Actual:** The planted text didn't match the real tag name. The fixture
still loaded and the surrounding test suite stayed green, but it wasn't
attacking the thing it was documented as attacking — the escaping code
path it was meant to exercise was never hit by anything the fixture
text-matched against. A passing suite gave no signal either way.

**Severity:** High. This is the most consequential kind of gap in a
project whose central claim is "the tests prove the defense holds": a
fixture that looks like coverage of the envelope-splitting attack but
doesn't exercise it is worse than no fixture, because it reads as
verified when it isn't.

**Workaround:** Corrected the fixture's payload to the real tag name, and
added an explicit test (agent/prompt.test.ts) asserting exactly one
occurrence of each tag in the built prompt even with the fixture loaded,
and that nothing after the true closing tag contains the fixture's
"trusted instruction" text.

**Suggestion:** Write the attack against the actual implementation, not
from memory of what a tag should be — grep the source for the literal
string before hand-authoring a fixture meant to collide with it. For any
"this fixture exercises this code path" claim, assert something that
would fail if the code path weren't hit, not just that parsing succeeded.

### 2026-09-24 — A demo chip was wired to the right fixture, but the reply displayed none of what made it interesting

**Task attempted:** Build /web's suggested-utterance chip for the "model
confidently claims a cart is under budget when it isn't" scenario
(recorded_sonnet_false_compliance) — the single most consequential
finding from the injection spike, per docs/injection-fixtures.md.

**Steps taken:** Wired the chip to the correct fixture and scenario name;
the orchestrator ran it correctly, denied on the true catalog total, and
every test covering the flow passed.

**Expected:** Passing tests and correct wiring meaning the beat is
actually visible to a viewer.

**Actual:** The assistant's spoken reply used the same generic "I can't
approve it, that's over budget" phrasing as any other denial. Nothing in
the UI surfaced the model's own confident, wrong claim ("well under
budget") that makes this scenario worth a dedicated demo path in the
first place. Code worked, tests passed, and the one thing that made this
beat worth building was invisible on screen.

**Severity:** High for a project whose Design criterion depends on a live
demo — this would have shipped a technically-correct but pedagogically
dead control for the project's strongest single finding, and nothing in
the test suite would have flagged it, since the tests checked the
verdict, not the narrative.

**Workaround:** Added a reply path that quotes the model's raw recorded
claim verbatim, and a test asserting the reply text itself — not just the
verdict — matches the model's stated figures.

**Suggestion:** When a test's purpose is "prove this demo beat is
visible," assert against the user-facing text, not just the underlying
data. A green test on the data layer says nothing about whether the
point actually reads on screen.

### 2026-09-23 — Audit durability claim held under transactional reasoning but broke under exception propagation

**Task attempted:** Implement /checkout's attemptCheckout so a rejected
or failed checkout attempt still leaves an audit trail, per docs/spec.md's
audit event list.

**Steps taken:** Initially reasoned about audit durability purely in
terms of the database transaction boundary — as long as
checkout_attempted and checkout_result are each committed, the trail is
complete.

**Expected:** Every call to attemptCheckout produces both audit entries,
regardless of outcome.

**Actual:** That reasoning didn't account for exceptions raised outside
the transaction itself — an unhandled exception anywhere in the flow
would propagate past the point where checkout_result gets appended,
silently skipping it, with no rollback involved at all since nothing had
been committed to roll back.

**Severity:** Medium-high. Caught before anything shipped, but it's
exactly the kind of gap that wouldn't show up in a happy-path test — only
in an exception path deliberately exercised.

**Workaround:** Wrapped the full attempt in try/catch, with
checkout_result appended on every path including the catch block
(best-effort, itself swallowed if the database is what's unavailable),
and documented the one remaining limit — lock contention preventing the
very first append — explicitly in docs/threat-model.md rather than
silently.

**Suggestion:** For any "this always gets logged" claim, write the test
that forces an exception mid-flow, not just the test that forces a normal
rejection. Transaction boundaries and exception boundaries are not the
same boundary.

### 2026-09-23 — request_hash left undefined in docs/spec.md, with no way to compute it at issuance

**Task attempted:** Implement tokens/issue.ts's issueToken(), which
docs/spec.md lists as taking a request_hash field.

**Steps taken:** Looked for a canonicalization scheme for a Request
object to hash, the same way tokens/canonicalize.ts defines one for Cart.

**Expected:** A defined Request shape and a canonicalizeRequest()
analogous to canonicalizeCart().

**Actual:** Neither existed. docs/spec.md names request_hash as a token
field but only ever defines canonicalization for cart_hash — there was no
Request type and no hashing scheme to compute it from inside /tokens,
which by design never touches a database or an orchestration layer to go
find one.

**Severity:** Medium. Not blocking — resolved cleanly — but a spec gap
that could have produced a token issuer either inventing an ad hoc hash
scheme or silently hardcoding a placeholder.

**Workaround:** issueToken() accepts requestHash as an already-computed
value supplied by the caller, documented as the caller's responsibility.
Once /orchestrator existed, it computed this via audit/hash.ts's existing
payloadHash() over the persisted Request object, reusing an
already-defined canonicalization rather than inventing a second one.

**Suggestion:** Before a module's function signature commits to a field,
confirm the spec actually defines how to produce it — a listed field with
no defined derivation is a gap that should be closed in the spec, not
absorbed silently by whichever module implements the function first.

### 2026-09-23 — Document identifier not stable across tool responses

**Task attempted:** Edit a specific table cell in a working document
created earlier in the same session.

**Steps taken:** Reused the container identifier returned when the
document was created. Sent the edit.

**Expected:** The edit applies, as it had for six prior edits in the
session.

**Actual:** Five consecutive rejections. The first was a legitimate
content error, but the following four returned a permission error rather
than a "document not found" error, which pointed at the wrong diagnosis
and sent me looking for an access problem that did not exist. The real
cause was an identifier mismatch between the creation response and the
canonical link.

**Severity:** Medium. Not blocking, but roughly ten minutes lost to a
misleading error class.

**Workaround:** Listed artifacts to retrieve the canonical link, then
used that identifier. Worked on the first try.

**Suggestion:** Return "not found" rather than "forbidden" when an
identifier does not resolve. A permission error on a nonexistent resource
is actively misleading, and it is the kind of thing that costs real time
under deadline.

### 2026-09-24 — Spike steering heuristic counted a model's refusal as evidence of steering

**Task attempted:** Measure, via scripts/spike-injection.ts, whether real
Bedrock models adopt planted injection instructions, using a text
heuristic over the model's free-form reasoning to detect "steering."

**Steps taken:** Ran the spike against Sonnet 4.6; the heuristic flagged
one trial as steered.

**Expected:** The heuristic's REFUSAL_SIGNALS list catches the model's own
refusal language and correctly excludes it from being counted as
steering.

**Actual:** The model's actual refusal ("this was ignored as untrusted
product data") didn't match any phrase in the detector's fixed
REFUSAL_SIGNALS list, so the heuristic flagged the response as steered —
a false positive rooted in the same underlying issue in both directions:
a steered response and a refusal both necessarily mention the injected
content, and a fixed phrase list can't anticipate every way a model
phrases refusal.

**Severity:** Medium-low. Didn't affect the real security claim (the raw
response was read directly and correctly counted as non-steered in the
reported results), but did produce a measurement artifact that needed
manual review to catch, and would misreport silently if not checked.

**Workaround:** Read the raw response directly rather than trusting the
detector's verdict for the final reported numbers; disclosed the
detector's own false-positive limitation transparently in
docs/injection-fixtures.md rather than treating the heuristic's count as
ground truth.

**Suggestion:** A refusal/steering classifier built on a fixed phrase
list should be treated as a triage aid, not a source of truth — always
spot-check flagged trials against the raw text before reporting a number
derived from it.

### 2026-09-23 — Underspecified verifier semantics produced an unsatisfiable test plan

**Task attempted:** Write tamper-detection tests for the audit chain
verifier against a test plan naming three tamper types.

**Steps taken:** Implemented the verifier, then tried to map "tamper with
a payload," "tamper with an entry_hash directly," and "delete a middle
row" onto three distinct reason codes.

**Expected:** Three tamper actions, three reason codes.

**Actual:** Two of the three land on hash_mismatch. A lone entry_hash
edit cannot produce broken_link, because entry_hash is defined over its
own row's fields and self-consistency fails at that seq first. The
broken_link branch was unreachable by the plan as written and would have
gone untested.

**Severity:** Low as a bug, medium as a process issue. No defect shipped,
but the spec said only that the verifier "reports the first break"
without defining the break classes, which is what let the bad test plan
through.

**Workaround:** Added a fourth test forging prev_hash with a recomputed
entry_hash, which is the only way to exercise broken_link. Then wrote the
failure classes and their detection order into docs/spec.md.

**Suggestion:** Specify failure taxonomies before writing tests against
them. An error union with an unreachable variant is a design smell that a
test plan written from prose will not catch.

### 2026-09-23 — Compiled output silently drops the catalog fixture

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

**Resolution (2026-09-24):** /web landed and did hit this, exactly as
predicted. Sidestepped rather than fixed: `npm run dev` runs
`tsx web/server.ts` directly against source, never through `dist/`, so
`loadCatalog()`'s import.meta.url-relative path resolves correctly without
a postbuild step. The underlying gap — `tsc` silently producing a broken
`dist/` for any script that isn't run via tsx or vitest — is still there
and still unaddressed. It stays fine as long as nothing besides `npm run
build`'s type-check role reads `dist/` as a runnable artifact.

### 2026-09-24 — CLAUDE.md's scope-discipline anchor didn't exist

**Task attempted:** Build /web per CLAUDE.md's "scope discipline: if it is
not in docs/demo-script, question building it," using a detailed in-chat
spec for what /web should contain.

**Steps taken:** Checked for docs/demo-script.md before starting, since
the instruction assumes it exists as the thing to check scope against.

**Expected:** The file exists (referenced by name, present tense, no
qualifier) and /web's scope gets checked against it before writing code.

**Actual:** No such file anywhere in docs/. The rule that's supposed to
gate scope had nothing to gate against.

**Severity:** Low — the same message that asked for /web also fully
specified its beats, so there was enough to proceed on. But the rule was
unenforceable as written, silently, which is worse than it being absent:
a future session invoking the same rule with a vaguer request would have
nothing to check against and no signal that anything was wrong.

**Workaround:** Proceeded from the beats given in chat, then wrote
docs/demo-script.md (this repo's now source of truth for the rule) from
that same message once /web was done, so the anchor exists for next time.

**Suggestion:** When a CLAUDE.md rule names a specific file as its
authority, create that file in the same change that adds the rule, not
later. An enforcement rule pointing at nothing fails silently instead of
loudly, which defeats the point of writing it down.
