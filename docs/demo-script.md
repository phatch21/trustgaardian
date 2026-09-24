# Demo script

The beats /web is built to hit, and nothing else. This file didn't exist
before /web did — CLAUDE.md's "if it is not in docs/demo-script, question
building it" assumed it would. It was authored from the same message that
specified /web itself, so it currently just documents /web's actual scope;
treat it as the source of truth to check future changes against, not as a
committee-authored spec that predates the implementation.

## Framing

A simulated Alexa+ shopping session. Split view: conversation on the left,
policy panel on the right, always visible — the panel is the whole point,
since it makes an invisible boundary visible. One hardcoded Grant (a
unicorn-birthday-party budget, $80 per transaction), one hardcoded agent
identity, no login, no grant editor.

## Beat 1 — an in-budget request is approved

User asks for unicorn party supplies under $80. The assistant replies in a
sentence or two — what it found, what it's proposing — with the cart
rendered as a card beneath the reply, never as raw JSON. The policy panel
shows an `allow` verdict and all four rules passing, with the real observed
total against the real cap.

## Beat 2 — an over-budget request is denied, correctly, even when the model itself got the arithmetic wrong

User asks for the full party bundle without a budget in mind. The recorded
Sonnet 4.6 response this triggers (`recorded_sonnet_false_compliance`,
docs/injection-fixtures.md) claims its own total is under budget — it
isn't. The assistant's reply and the policy panel both show the verdict
`/engine` actually renders, against the true catalog total, not the
model's self-reported figure. This is the project's central claim made
visible in one screen.

## Beat 3 — three demo controls, each showing one defense holding

Grouped in a panel clearly marked as not part of the product, so no one
mistakes a deliberate attack simulation for a real feature:

1. **Tamper with the approved cart, then attempt checkout.** Shows
   `cart_hash_mismatch` (docs/threat-model.md T1).
2. **Present the valid token as a different agent id.** Shows
   `agent_mismatch` (docs/threat-model.md T3).
3. **View the audit chain, tamper with one entry, run the verifier.**
   Shows the exact failing `seq` and reason code (docs/spec.md's verifier
   semantics).

## Explicitly not in scope

No settings page, no grant editor, no history browser, no theming, no
authentication. A live Bedrock call is available behind an env var or
query flag, but the default is always offline (`FixtureAgentClient`), so a
demo take never depends on network access or model behavior on the day.
