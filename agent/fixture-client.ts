// Offline AgentClient backed by agent/fixtures/agent-responses.json.
// Returns whatever text was recorded under the scenario name it was
// constructed with, ignoring the actual prompt content — this is what
// makes /agent testable without a network call or AWS credentials.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentClient, AgentPrompt } from "./types.js";

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "agent-responses.json");

let cachedFixtures: Record<string, string> | undefined;

function loadFixtures(): Record<string, string> {
  if (cachedFixtures) return cachedFixtures;

  const raw: unknown = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("agent-responses.json must be a JSON object of scenario name to response text");
  }
  for (const [scenario, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      throw new Error(`agent-responses.json scenario "${scenario}" must be a string`);
    }
  }

  cachedFixtures = raw as Record<string, string>;
  return cachedFixtures;
}

export class FixtureAgentClient implements AgentClient {
  constructor(private readonly scenario: string) {}

  async complete(_prompt: AgentPrompt): Promise<string> {
    const fixtures = loadFixtures();
    const response = fixtures[this.scenario];
    if (response === undefined) {
      throw new Error(
        `no recorded fixture response for scenario "${this.scenario}" in agent/fixtures/agent-responses.json`,
      );
    }
    return response;
  }
}
