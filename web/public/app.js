"use strict";

const conversationEl = document.getElementById("conversation");
const formEl = document.getElementById("utterance-form");
const inputEl = document.getElementById("utterance-input");
const micButton = document.getElementById("mic-button");
const micStatus = document.getElementById("mic-status");
const constraintsEl = document.getElementById("grant-constraints");
const decisionPanelEl = document.getElementById("decision-panel");
const tamperCartButton = document.getElementById("tamper-cart-button");
const tamperCartResultEl = document.getElementById("tamper-cart-result");
const agentMismatchButton = document.getElementById("agent-mismatch-button");
const agentMismatchResultEl = document.getElementById("agent-mismatch-result");
const viewAuditButton = document.getElementById("view-audit-button");
const auditLogEl = document.getElementById("audit-log");
const tamperSeqInput = document.getElementById("tamper-seq");
const tamperAuditButton = document.getElementById("tamper-audit-button");
const verifyChainButton = document.getElementById("verify-chain-button");
const auditResultEl = document.getElementById("audit-result");

// Holds the most recently approved cart + token so the demo controls have
// something real to attack. Nothing here is a session or a history — just
// the one most recent allow, gone on reload.
let lastApproved = null;

function formatUsd(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function apiUrl(path) {
  return path + window.location.search;
}

async function postJson(path, body) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

async function getJson(path) {
  const res = await fetch(apiUrl(path));
  return res.json();
}

function appendUserTurn(text) {
  const turn = document.createElement("div");
  turn.className = "turn user";
  turn.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  conversationEl.appendChild(turn);
  conversationEl.scrollTop = conversationEl.scrollHeight;
}

function appendAssistantTurn(replyText, cart) {
  const turn = document.createElement("div");
  turn.className = "turn assistant";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = replyText;
  turn.appendChild(bubble);

  if (cart && cart.items.length > 0) {
    turn.appendChild(buildCartCard(cart));
  }

  conversationEl.appendChild(turn);
  conversationEl.scrollTop = conversationEl.scrollHeight;
}

function buildCartCard(cart) {
  const card = document.createElement("div");
  card.className = "cart-card";

  const title = document.createElement("h4");
  title.textContent = "Proposed cart";
  card.appendChild(title);

  const list = document.createElement("ul");
  for (const item of cart.items) {
    const li = document.createElement("li");
    const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
    li.innerHTML = `<span>${escapeHtml(item.title)}${qty}</span><span>${formatUsd(item.lineTotalCents)}</span>`;
    list.appendChild(li);
  }
  card.appendChild(list);

  const total = document.createElement("div");
  total.className = "cart-total";
  total.innerHTML = `<span>Total</span><span>${formatUsd(cart.totalCents)}</span>`;
  card.appendChild(total);

  return card;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function renderGrantConstraints(constraints) {
  const rows = [
    ["Per-transaction cap", formatUsd(constraints.spend.perTransactionCents)],
    ["Per-window cap", `${formatUsd(constraints.spend.perWindowCents)} / ${constraints.spend.window}`],
    ["Per-item cap", formatUsd(constraints.items.maxUnitPriceCents)],
    ["Max quantity per item", String(constraints.items.maxQuantity)],
    ["Max purchases", `${constraints.frequency.maxPurchases} / ${constraints.frequency.window}`],
    ["Denied categories", constraints.categories.deny.join(", ") || "none"],
    ["Denied merchants", constraints.merchants.deny.join(", ") || "none"],
    ["Escalation above", formatUsd(constraints.escalation.requireApprovalAboveCents)],
  ];

  constraintsEl.innerHTML = rows
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

function renderDecision(decision) {
  if (!decision) {
    decisionPanelEl.innerHTML = '<p class="empty-state">No decision yet — ask your assistant for something.</p>';
    return;
  }

  const badgeClass = decision.verdict === "allow" ? "allow" : "deny";
  const rows = decision.ruleResults
    .map((rule) => {
      const resultClass = rule.passed ? "rule-pass" : "rule-fail";
      const resultText = rule.passed ? "pass" : "fail";
      return `<tr>
        <td>${escapeHtml(rule.ruleId)}</td>
        <td class="${resultClass}">${resultText}</td>
        <td>${escapeHtml(formatRuleValue(rule, rule.observed))}</td>
        <td>${escapeHtml(formatRuleValue(rule, rule.limit))}</td>
      </tr>`;
    })
    .join("");

  decisionPanelEl.innerHTML = `
    <span class="verdict-badge ${badgeClass}">${decision.verdict}</span>
    <table class="rule-table">
      <thead><tr><th>Rule</th><th>Result</th><th>Observed</th><th>Limit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Which unit a rule's observed/limit values are in, driven off the rule id
// (and, for item_limits, which specific check failed — the one rule that
// can report either a price or a plain count) rather than guessed from the
// number's size. engine/rules.ts is the source of truth for these shapes.
function ruleValueKind(rule) {
  if (rule.ruleId === "transaction_cap") return "currency";
  if (rule.ruleId === "item_limits") {
    if (rule.reason === "unit_price_exceeds_limit") return "currency";
    if (rule.reason === "quantity_exceeds_limit") return "count";
  }
  return "default";
}

// Every RuleResult.observed/limit is `unknown` at the type level — some
// rules report a plain string or number, grant_validity reports a small
// object ({status, agentId} on pass). This renders any of those as a
// short human string, never raw JSON: objects are flattened to their
// values, joined — {"status":"active","agentId":"agent_demo"} becomes
// "active, agent_demo".
function humanizeValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.map(humanizeValue).join(", ");
  }
  if (typeof value === "object") {
    return Object.values(value).map(humanizeValue).join(", ");
  }
  return String(value);
}

function formatRuleValue(rule, raw) {
  if (raw === null || raw === undefined) return "—";
  const kind = ruleValueKind(rule);
  if (kind === "currency" && typeof raw === "number") return formatUsd(raw);
  if (kind === "count" && typeof raw === "number") return String(raw);
  return humanizeValue(raw);
}

async function loadGrant() {
  try {
    const grant = await getJson("/api/grant");
    if (grant.constraints) {
      renderGrantConstraints(grant.constraints);
    }
  } catch {
    constraintsEl.innerHTML = "<dt>Unavailable</dt><dd>Could not load the active grant.</dd>";
  }
}

async function sendUtterance(text, scenario) {
  appendUserTurn(text);
  inputEl.value = "";

  const result = await postJson("/api/utterance", { text, scenario });

  appendAssistantTurn(result.reply, result.cart);
  renderDecision(result.decision);

  if (result.ok && result.token && result.decision) {
    lastApproved = { cartId: result.decision.cartId, token: result.token };
    tamperCartButton.disabled = false;
    agentMismatchButton.disabled = false;
    tamperCartResultEl.textContent = "";
    agentMismatchResultEl.textContent = "";
  }
}

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = inputEl.value.trim();
  if (text.length === 0) return;
  void sendUtterance(text, undefined);
});

for (const button of document.querySelectorAll(".suggestion")) {
  button.addEventListener("click", () => {
    void sendUtterance(button.dataset.text, button.dataset.scenario);
  });
}

// --- Mic affordance, with a typed fallback that always works ---

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognitionImpl) {
  const recognition = new SpeechRecognitionImpl();
  recognition.lang = "en-US";
  recognition.interimResults = false;

  micButton.addEventListener("click", () => {
    micButton.classList.add("listening");
    micStatus.hidden = false;
    micStatus.textContent = "Listening…";
    recognition.start();
  });

  recognition.addEventListener("result", (event) => {
    const text = event.results[0][0].transcript;
    micStatus.hidden = true;
    micButton.classList.remove("listening");
    if (text.trim().length > 0) {
      void sendUtterance(text.trim(), undefined);
    }
  });

  recognition.addEventListener("end", () => {
    micButton.classList.remove("listening");
  });

  recognition.addEventListener("error", () => {
    micButton.classList.remove("listening");
    micStatus.hidden = false;
    micStatus.textContent = "Didn't catch that — try typing instead.";
  });
} else {
  micButton.addEventListener("click", () => {
    micStatus.hidden = false;
    micStatus.textContent = "Voice input isn't available in this browser — type your request instead.";
  });
}

// --- Demo controls ---

tamperCartButton.addEventListener("click", async () => {
  if (!lastApproved) return;
  const result = await postJson("/api/demo/tamper-checkout", lastApproved);
  tamperCartResultEl.textContent = result.ok
    ? `Unexpectedly succeeded (nonce ${result.nonce})`
    : `Rejected: ${result.reason}`;
});

agentMismatchButton.addEventListener("click", async () => {
  if (!lastApproved) return;
  const result = await postJson("/api/demo/agent-mismatch-checkout", lastApproved);
  agentMismatchResultEl.textContent = result.ok
    ? `Unexpectedly succeeded (nonce ${result.nonce})`
    : `Rejected: ${result.reason}`;
});

async function renderAuditLog() {
  const { entries } = await getJson("/api/audit");
  auditLogEl.innerHTML = entries
    .map(
      (entry) =>
        `<div class="audit-row"><span>#${entry.seq}</span><span>${escapeHtml(entry.eventType)}</span><span>${escapeHtml(entry.actor)}</span></div>`,
    )
    .join("");
  if (entries.length > 0) {
    tamperSeqInput.value = String(entries[entries.length - 1].seq);
  }
}

viewAuditButton.addEventListener("click", () => {
  void renderAuditLog();
});

tamperAuditButton.addEventListener("click", async () => {
  const seq = Number(tamperSeqInput.value);
  if (!Number.isInteger(seq)) return;
  const result = await postJson("/api/demo/tamper-audit", { seq });
  auditResultEl.textContent = result.ok ? `Tampered with entry seq ${result.seq}.` : `Error: ${result.error}`;
  void renderAuditLog();
});

verifyChainButton.addEventListener("click", async () => {
  const result = await postJson("/api/demo/verify-chain", {});
  auditResultEl.textContent = result.ok
    ? "Chain verifies intact."
    : `Broken at seq ${result.seq}: ${result.reason}`;
});

void loadGrant();
