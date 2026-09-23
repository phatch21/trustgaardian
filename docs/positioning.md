# Positioning

## The space is occupied

| Framework                     | Published by                                | What it covers                                                                                                        |
| ----------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AP2                           | Google, Sept 2025; FIDO Alliance governance | Signed Intent, Cart and Payment Mandates as W3C Verifiable Credentials; cart-hash binding; non-repudiable audit trail |
| ACP                           | OpenAI and Stripe                           | Agent-initiated checkout session lifecycle                                                                            |
| UCP                           | Google, NRF 2026                            | Merchant capability discovery                                                                                         |
| ACE                           | American Express, April 2026                | Closed-loop intent validation, spend controls, agent registration                                                     |
| TAP / VIC, Mastercard, Alipay | Respective networks                         | Agent identity attestation, network-side controls                                                                     |

Amazon is absent on purpose. It has published no agent authorization spec.
Its posture is a closed ecosystem where Rufus, Alexa+ and Buy for Me are the
only agents with catalog access, alongside AgentCore as agent-building
infrastructure. Nothing here competes with something Amazon shipped.

## The gap targeted

Signed mandates prove what a user approved. They say much less about how the
cart got assembled. In AP2 the merchant controls free-text fields on the
items an agent ranks and selects, which puts attacker-controlled text
upstream of the human approval step. AP2 also binds authorization to the
user's signing key rather than the agent's, so a compromised agent that
elicits a valid user signature produces a valid authorization.

## The claim, stated narrowly

Deterministic constraint enforcement between intent and approval, bound to
agent identity, holding under hostile catalog input.

Not claimed: signed intent, cart-hash binding, audit chains, non-repudiation.
All prior art, credited as such.

## What this is not

Not a protocol. Not an AP2 or ACE implementation. Not interoperable with any
published framework. Not a payment system.

## References

- https://ap2-protocol.org/
- https://www.agenticcommerce.dev/docs
- https://arxiv.org/pdf/2609.11757
- https://www.americanexpress.com/en-us/newsroom/articles/innovation/american-express-debuts-agentic-commerce-experiences--ace--devel.html
