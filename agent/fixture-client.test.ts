import { describe, expect, it } from "vitest";
import { FixtureAgentClient } from "./fixture-client.js";

const DUMMY_PROMPT = { system: "s", user: "u" };

describe("FixtureAgentClient", () => {
  it("returns the recorded text for a known scenario, regardless of the prompt passed in", async () => {
    const client = new FixtureAgentClient("clean_cart_match");
    const response = await client.complete(DUMMY_PROMPT);
    expect(response).toContain("UNI-DEC-02");
  });

  it("throws a clear error for an unrecorded scenario name", async () => {
    const client = new FixtureAgentClient("not-a-real-scenario");
    await expect(client.complete(DUMMY_PROMPT)).rejects.toThrow(/not-a-real-scenario/);
  });
});
