import { afterEach, describe, expect, it } from "vitest";
import { BedrockAgentClient } from "./bedrock-client.js";

describe("BedrockAgentClient construction", () => {
  const originalModelId = process.env.BEDROCK_MODEL_ID;

  afterEach(() => {
    if (originalModelId === undefined) {
      delete process.env.BEDROCK_MODEL_ID;
    } else {
      process.env.BEDROCK_MODEL_ID = originalModelId;
    }
  });

  it("throws when no model id is passed and BEDROCK_MODEL_ID is unset", () => {
    delete process.env.BEDROCK_MODEL_ID;
    expect(() => new BedrockAgentClient()).toThrow(/BEDROCK_MODEL_ID/);
  });

  it("accepts an explicit model id with no environment variable set", () => {
    delete process.env.BEDROCK_MODEL_ID;
    expect(() => new BedrockAgentClient({ modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0" })).not.toThrow();
  });

  it("falls back to BEDROCK_MODEL_ID when no explicit model id is passed", () => {
    process.env.BEDROCK_MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";
    expect(() => new BedrockAgentClient()).not.toThrow();
  });
});
