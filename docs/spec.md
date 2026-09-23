# Spec

Six objects. A Grant is a standing authorization; a Request is one shopping
task under it; a Decision authorizes exactly one Cart.

| Object         | Purpose                                       | Key fields                                                                                    |
| -------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Grant          | Standing authorization from user to one agent | id, user_id, agent_id, expires_at, status, constraints, escalation                            |
| Request        | One shopping task under a grant               | id, grant_id, raw_utterance, structured (goal, qualifiers, budget, deadline)                  |
| Cart           | What the agent proposes                       | id, request_id, items (sku, merchant, unit_price, qty, category), total                       |
| Decision       | Policy engine output                          | id, cart_id, verdict, rule_results, evaluated_at                                              |
| ExecutionToken | Signed authorization for one cart             | grant_id, agent_id, request_hash, cart_hash, verdict, issued_at, expires_at, nonce, signature |
| AuditEntry     | Append-only record                            | seq, prev_hash, timestamp, actor, event_type, payload_hash                                    |

## Grant constraints

```
spend:      { per_transaction, per_window, window, currency }
merchants:  { allow[], deny[] }
categories: { allow[], deny[] }
frequency:  { max_purchases, window }
items:      { max_unit_price, max_quantity }
escalation: { require_approval_above, auto_deny_on[] }
```

## Rule evaluation

Fail-closed. Any rule that errors, or any field the engine cannot parse,
produces deny. Pure deterministic code, no model call in the path.

Order, most restrictive first so the audit trail reads clearly:

1. Grant validity (exists, not expired, status active, agent_id matches the
   calling agent)
2. Deny lists (merchant, category)
3. Per-item limits (unit price, quantity)
4. Cart total against per-transaction cap
5. Rolling window spend against per-window cap
6. Frequency against window
7. Escalation threshold

Every rule returns `{ rule_id, passed, reason, observed, limit }`. All rules
run even after the first failure, so the UI shows the complete picture rather
than the first tripwire.

Verdicts: allow, deny, escalate. Escalate pauses for explicit user
confirmation and, once confirmed, issues a token exactly as allow does.

## ExecutionToken

Ed25519 over a canonical serialization of the token body. Lifetime 120
seconds. Single-use, enforced by a nonce the checkout verifier records.

`cart_hash` is SHA-256 of the canonicalized item list, sorted by sku, with
quantities and prices included. Write the canonicalization rules down before
any signing code: a hash mismatch caused by sort order looks identical to an
attack.

Binding a signature to a hash of the approved cart is prior art. Used here
because it is correct, not because it is new.

## Audit chain

```
entry_hash = SHA-256(prev_hash || timestamp || actor || event_type || payload_hash)
```

Fields are length-prefixed before concatenation, as in tokens/canonicalize.ts,
so attacker-influenced field content cannot shift boundaries to produce a
collision. Genesis entry uses a zero prev_hash (64 zeros).

Appends read the current tail and insert inside a single transaction. A naive
read-then-insert lets two concurrent appends claim the same predecessor,
silently forking the chain and making the verifier's report meaningless.

Events logged: grant created, request received, cart proposed, decision
rendered, token issued, checkout attempted, checkout result.

### Verifier semantics

`verifyChain` walks from genesis and reports the first break. Three failure
classes, each detected at a distinct point:

| Reason          | Condition                                                                                    | What it means                                                  |
| --------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `hash_mismatch` | A row's stored entry_hash does not match a recomputation over its own five fields            | Any field of that row was altered, including entry_hash itself |
| `broken_link`   | A row is internally consistent but its prev_hash does not match the predecessor's entry_hash | The link was forged with entry_hash recomputed to match        |
| `seq_gap`       | seq numbering skips a value                                                                  | A row was deleted                                              |

These are not interchangeable, and a single tampering action does not map
freely onto them. Editing entry*hash alone always yields `hash_mismatch`, never
`broken_link`: entry_hash is defined over the row's own fields, so the
self-consistency check fails at that row's seq, before verification reaches
the next row where a link check could run. Reaching `broken_link` requires
forging prev_hash \_and* recomputing entry_hash to stay internally consistent
with the forgery.

Detection order is hash_mismatch, then broken_link, then seq_gap, and the
earlier seq always wins. A chain with multiple breaks reports only the first.

## Escalation UX

When a cart escalates, the user sees the cart, the rule that triggered, the
observed value against the limit, and two buttons. Approving re-runs the full
evaluation rather than trusting the earlier result, since the cart may have
changed while the user was deciding.

## Agent binding

A grant binds to a single agent identity. It authorizes one registered
agent_id, not any agent the user runs. For the demo the agent id is
hardcoded, with no registration flow.

## Schema

```sql
grants(id TEXT PK, user_id, agent_id, created_at, expires_at,
       status, constraints_json)
requests(id TEXT PK, grant_id, raw_utterance, structured_json, created_at)
carts(id TEXT PK, request_id, items_json, total_cents, created_at)
decisions(id TEXT PK, cart_id, verdict, rule_results_json, evaluated_at)
tokens(nonce TEXT PK, grant_id, agent_id, cart_hash, issued_at,
       expires_at, consumed_at)
audit(seq INTEGER PK AUTOINCREMENT, prev_hash, timestamp, actor,
      event_type, payload_hash, entry_hash)
```

Money is integer cents everywhere. Float comparison against a spend cap is a
bug you do not want in a security demo.

`tokens.consumed_at` enforces single use. Checkout sets it inside the same
transaction as verification, so a replay loses the race rather than winning
it.

## Test bar before the demo

- Unit tests on every rule, each with a passing and a failing case
- One end-to-end test per defended threat, asserting the attack fails
- An audit chain verifier test that tampering is detected
