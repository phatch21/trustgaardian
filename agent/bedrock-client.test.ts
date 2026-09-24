import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

// Mocks only BedrockRuntimeClient's constructor/send — ConverseCommand
// stays the real class, so `command instanceof ConverseCommand` and
// `command.input` below reflect what production code actually builds,
// not a hand-rolled stand-in for it.
vi.mock("@aws-sdk/client-bedrock-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-bedrock-runtime")>();
  return {
    ...actual,
    BedrockRuntimeClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
  };
});

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
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

describe("BedrockAgentClient.complete", () => {
  const MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";

  beforeEach(() => {
    sendMock.mockReset();
  });

  it("sends system and user content as structurally separate Converse fields, not commingled", async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [{ text: "ok" }] } } });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await client.complete({ system: "SYSTEM_MARKER_TEXT", user: "USER_MARKER_TEXT" });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(ConverseCommand);

    const input = (command as InstanceType<typeof ConverseCommand>).input;
    expect(input.system).toEqual([{ text: "SYSTEM_MARKER_TEXT" }]);
    expect(input.messages).toEqual([{ role: "user", content: [{ text: "USER_MARKER_TEXT" }] }]);

    // Structural separation, not just "the right text somewhere": neither
    // field's serialized content leaks into the other. This is the claim
    // agent/prompt.test.ts's envelope tests can't make on their own — those
    // only prove buildPrompt() keeps the strings apart, not that the
    // Bedrock request itself keeps them apart at the API level.
    expect(JSON.stringify(input.system)).not.toContain("USER_MARKER_TEXT");
    expect(JSON.stringify(input.messages)).not.toContain("SYSTEM_MARKER_TEXT");
  });

  it("places the common inference parameters in inferenceConfig", async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [{ text: "ok" }] } } });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await client.complete({ system: "s", user: "u" });

    const command = sendMock.mock.calls[0]?.[0] as InstanceType<typeof ConverseCommand>;
    expect(command.input.inferenceConfig).toEqual({ maxTokens: 1500, temperature: 0 });
  });

  it("returns the first content block's text on a well-formed response", async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [{ text: "hello" }] } } });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    const result = await client.complete({ system: "s", user: "u" });

    expect(result).toBe("hello");
  });

  it("throws a clear error when the content array is empty, rather than returning an empty string", async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [] } } });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow(/no content blocks/);
  });

  it("throws a clear error when output/message/content is entirely missing, rather than throwing on undefined access", async () => {
    sendMock.mockResolvedValue({});

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow(/no content blocks/);
  });

  it("throws a clear error when the first content block has no text", async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [{}] } } });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow(/no text/);
  });
});
