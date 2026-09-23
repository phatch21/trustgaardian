# TrustGaardian

A deterministic constraint-enforcement layer for AI shopping agents. Built as
a simulated Alexa+ experience for Amazon's Build, Ship, Shape developer
hackathon, 2026.

Research prototype. Not a payment system, not a protocol, not for production.

## The problem

When an AI agent shops on your behalf, it assembles a cart from merchant
content it does not control and you did not read. If that content carries
instructions, the agent can be steered. Approval signatures prove what you
agreed to; they say much less about how the cart got built.

## What this does

Puts deterministic code between the shopping request and the approval step.
A Grant expresses your constraints. The policy engine evaluates a proposed
Cart against them in pure code that never reads listing text, so a prompt
injection that fools the agent still cannot raise a spend cap or add a
merchant. Approval produces a signed ExecutionToken bound to one exact cart
and one agent id.

Every step is recorded in a hash-chained, append-only log: grant created,
request received, cart proposed, decision rendered, token issued, checkout
attempted, checkout result. A verifier walks the chain and reports the first
break, distinguishing an altered row from a forged link from a deleted one.
Tampering is detectable rather than merely discouraged.

## Threats defended

1. Cart substitution after approval, via cart-hash binding
2. Intent injection through product listings, via the deterministic engine
3. Policy engine bypass, via fail-closed signature verification and agent
   binding

Out of scope and undefended: budget splitting across transactions, signing
key compromise, merchant-side fraud, agent-merchant collusion, denial of
service, user coercion. Audit logging has one named limit: under database
lock contention an attempt may leave no entry, because the log itself is
momentarily unwritable. See docs/threat-model.md.

## Prior art

Agent authorization for commerce is an active standards area. Google's Agent
Payments Protocol, OpenAI and Stripe's Agentic Commerce Protocol, and
frameworks published by American Express, Visa and Mastercard all address
authenticated intent, enforced spending boundaries, and non-repudiable audit
trails. Signed intent and cart-hash binding are prior art established by
those efforts and are not claimed as contributions here.

This project does not implement or interoperate with any of them. It is an
independent, card-agnostic research prototype exploring one narrower question
those frameworks leave open: deterministic constraint enforcement while an
agent assembles a cart from untrusted merchant content. Not affiliated with
or endorsed by any organization named above.

## Setup

```
npm install
npm run seed          # creates the SQLite database and runs migrations
npm test
npm run verify-chain  # independently walks the audit log's hash chain
```

Requires Node 20+. Every command above is real and passes on a fresh clone.

### Not yet wired

- **`npm run dev` and the web UI (`/web`).** No dev server exists yet;
  `/web` is a placeholder. There is nothing to open in a browser.
- **The Bedrock agent call (`/agent`).** No model call is wired up, online
  or offline — there is no `--offline` recorded-response mode either.
- **Catalog fixtures (`/catalog`).** `npm run seed` creates the database
  and runs the schema migration only; there are no fixture listings
  (including the planted injection payloads) to load yet.

Because of the point above, a freshly seeded database's audit log is empty
— `npm run verify-chain` will correctly report 0 entries verified. Right
now the only thing that exercises `/engine`, `/tokens`, `/audit`, and
`/checkout` end to end is the test suite (`npm test`).

## License

MIT
