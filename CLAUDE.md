# TrustGaardian

Deterministic constraint enforcement for an AI shopping agent. Simulated
Alexa+ experience for Amazon's Build, Ship, Shape hackathon.

## Premise

The agent is untrusted. The policy engine and checkout verifier are the
security boundary and must hold even when the agent is compromised or fooled.

## Object names (do not rename)

Grant, Request, Cart, Decision, ExecutionToken, AuditEntry.

Never reintroduce Mandate, Intent Mandate, Cart Mandate, or Proof of Intent.
Those are AP2 and Amex vocabulary and using them reads as a reimplementation.

## Non-negotiable rules

- Policy evaluation is deterministic code. No model call anywhere in the
  decision path. This is the security claim; do not suggest LLM-assisted
  evaluation.
- /engine has no I/O. Pure functions only. No network, no database, and it
  never reads merchant listing text.
- Fail closed. Any rule that errors, or any unparseable field, yields deny.
- Money is integer cents everywhere. Never floats.
- Grants bind to one agent_id. Tokens name the agent they were issued to.
- Tokens are single-use, 120 second lifetime, enforced via tokens.consumed_at
  set in the same transaction as verification.

## Not building

Real payments, card credentials, real merchant APIs, integration with ACE,
AP2, ACP or UCP, multi-user auth, public deployment, voice hardware, trained
models. Not interoperable with any published protocol.

## Positioning

Never claim novelty for signed intent, cart-hash binding, or audit chains.
All are prior art. See docs/positioning.md. The narrow contribution is
deterministic enforcement between intent and approval, bound to agent
identity, holding under hostile catalog input.

## Layout

/engine policy evaluation, pure, no I/O
/tokens signing, verification, canonicalization
/audit chain append and verify
/agent LLM call, prompt construction, untrusted-content envelope
/checkout mock verifier
/catalog fixtures, including planted injection payloads
/web split-view UI
/docs spec, threat model, positioning, friction log

## Stack

TypeScript, SQLite via better-sqlite3, Ed25519 via Node crypto, Bedrock for
the agent's model call.

## Working style

- Scope discipline. If it is not in docs/demo-script, question building it.
- Flag schedule risk honestly. Deadline is Oct 22.
- Push back on scope creep even when the idea is good.
- Grad-level security background, TypeScript and Python comfort. Skip
  beginner explanation.
- When something goes wrong, remind me to log it in docs/friction.md.
