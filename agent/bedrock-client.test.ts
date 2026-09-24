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
    expect(command.input.inferenceConfig).toEqual({ maxTokens: 4096, temperature: 0 });
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

describe("BedrockAgentClient.complete error visibility", () => {
  const MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0";
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMock.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("rethrows an SDK service exception unchanged, rather than converting it into a parse-shaped failure", async () => {
    const accessDenied = Object.assign(new Error("not available for this account"), {
      name: "AccessDeniedException",
      $metadata: { httpStatusCode: 403, requestId: "req-123" },
    });
    sendMock.mockRejectedValue(accessDenied);

    const client = new BedrockAgentClient({ modelId: MODEL_ID });

    // Same object, same name — nothing here re-labels an auth failure as
    // "the model returned bad text." A caller (or agent/parse.ts, several
    // layers downstream) never gets the chance to see this as JSON at all.
    await expect(client.complete({ system: "s", user: "u" })).rejects.toBe(accessDenied);
  });

  it("logs the exception's AWS error code, message, and request-tracing fields as explicit labeled fields before rethrowing", async () => {
    const throttled = Object.assign(new Error("Too many requests"), {
      name: "ThrottlingException",
      $metadata: { httpStatusCode: 429, requestId: "req-456" },
    });
    sendMock.mockRejectedValue(throttled);

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toContain("BedrockAgentClient");
    // Explicit, separately-labeled fields, not one sentence a reader has
    // to parse apart — an auth error, a throttle, and bad model output
    // each need to be tellable apart from the log line alone.
    expect(fields).toEqual({
      code: "ThrottlingException",
      message: "Too many requests",
      requestId: "req-456",
      httpStatusCode: 429,
    });
  });

  it("logs a distinguishing code even for a rejection that isn't a real AWS service exception", async () => {
    sendMock.mockRejectedValue("a raw string rejection");

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await expect(client.complete({ system: "s", user: "u" })).rejects.toBe("a raw string rejection");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toContain("BedrockAgentClient");
    expect(fields).toEqual({
      code: "string",
      message: "a raw string rejection",
      requestId: undefined,
      httpStatusCode: undefined,
    });
  });

  it("logs stopReason when the response text exists but isn't valid JSON, distinguishing truncation from a refusal", async () => {
    sendMock.mockResolvedValue({
      stopReason: "max_tokens",
      output: { message: { content: [{ text: '{"items": [{"sku": "UNI-DEC-01", "quantity"' }] } },
    });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    // complete() still returns the text as-is — this is diagnostics, not
    // a new rejection path. Deciding the text is unusable stays
    // agent/parse.ts's job.
    const result = await client.complete({ system: "s", user: "u" });
    expect(result).toBe('{"items": [{"sku": "UNI-DEC-01", "quantity"');

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, fields] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toContain("not valid JSON");
    expect(fields.stopReason).toBe("max_tokens");
  });

  it("does not log anything when the response text is valid JSON", async () => {
    sendMock.mockResolvedValue({
      stopReason: "end_turn",
      output: { message: { content: [{ text: '{"items": []}' }] } },
    });

    const client = new BedrockAgentClient({ modelId: MODEL_ID });
    await client.complete({ system: "s", user: "u" });

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
