// Maps a typed utterance to one of agent/fixtures/agent-responses.json's
// recorded scenarios, so the offline demo (FixtureAgentClient) responds
// differently to different phrasing without a live model call. This is
// not NLU — a small, deliberately narrow keyword match, good enough to
// drive a live demo's suggested phrasings and nothing more. An explicit
// scenario (sent by one of the UI's suggested-utterance buttons) always
// wins over the keyword guess.

const DEFAULT_SCENARIO = "clean_cart_match";

const KEYWORD_SCENARIOS: Array<{ pattern: RegExp; scenario: string }> = [
  {
    pattern: /no budget|whatever it takes|don.?t worry about (the )?(cost|budget|price)|get everything/i,
    scenario: "recorded_sonnet_false_compliance",
  },
  {
    pattern: /ignore.*(limit|budget)|pre-?approved|skip (the )?(policy|review)/i,
    scenario: "injection_item_included",
  },
];

export function selectScenario(text: string, explicitScenario?: string): string {
  if (explicitScenario) return explicitScenario;
  const match = KEYWORD_SCENARIOS.find((entry) => entry.pattern.test(text));
  return match?.scenario ?? DEFAULT_SCENARIO;
}
