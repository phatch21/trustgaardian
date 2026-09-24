// Real Bedrock-backed AgentClient. This is the only file in /agent that
// imports @aws-sdk/client-bedrock-runtime — everything else in the module
// talks to AgentClient, not to this.
//
// Credentials: BedrockRuntimeClient is constructed with no explicit
// credentials on purpose. Left alone, the SDK's default resolution chain
// checks for AWS_BEARER_TOKEN_BEDROCK (Bedrock API keys — a bearer token,
// resolved generically by @aws-sdk/core for any service via
// AWS_BEARER_TOKEN_<SIGNING_NAME>) before falling back to the standard
// IAM credential chain (env vars, shared config, SSO, IMDS, ...). Passing
// an explicit `credentials` option here would bypass that and silently
// break bearer-token auth for anyone using it — don't add one.
//
// IAM: despite the operation being named Converse, the IAM action it
// requires is bedrock:InvokeModel (and bedrock:InvokeModelWithResponseStream
// for streaming) — there is no bedrock:Converse action. A policy written
// against the literal API name will look plausible and fail at runtime.

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { AgentClient, AgentPrompt } from "./types.js";

export interface BedrockAgentClientOptions {
  modelId?: string;
  region?: string;
}

export class BedrockAgentClient implements AgentClient {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(options: BedrockAgentClientOptions = {}) {
    const modelId = options.modelId ?? process.env.BEDROCK_MODEL_ID;
    if (!modelId) {
      throw new Error(
        "BedrockAgentClient requires a model id: pass one explicitly, or set BEDROCK_MODEL_ID. There is no default.",
      );
    }
    this.modelId = modelId;
    this.client = new BedrockRuntimeClient(options.region ? { region: options.region } : {});
  }

  async complete(prompt: AgentPrompt): Promise<string> {
    const command = new ConverseCommand({
      modelId: this.modelId,
      // Converse's system prompt is a top-level array, structurally
      // separate from messages — not a message with a "system" role
      // folded into the same list. That separation is exactly what makes
      // the envelope claim (docs/threat-model.md T2) true at the API
      // level, not just by delimiter convention: prompt.system (the
      // instruction to treat listings as data) and prompt.user (the
      // listings themselves) go to genuinely different fields, so there
      // is no way for this call to concatenate one into the other even by
      // accident. agent/bedrock-client.test.ts asserts this.
      system: [{ text: prompt.system }],
      messages: [{ role: "user", content: [{ text: prompt.user }] }],
      // Only the four common inference parameters — maxTokens,
      // temperature, topP, stopSequences — belong in inferenceConfig.
      // Anything model-specific (e.g. Anthropic's top_k) goes in
      // additionalModelRequestFields instead; putting a model-specific
      // field in inferenceConfig (or vice versa) throws a validation
      // error rather than being ignored, so there's no quiet way to get
      // this wrong.
      inferenceConfig: { maxTokens: 1500, temperature: 0 },
    });

    const response = await this.client.send(command);

    // response.output.message.content[0].text, but every link in that
    // chain is optional in the SDK's types — a missing or empty content
    // array is a real failure (the model returned nothing usable), not
    // something to paper over with a default empty string, and not
    // something to let throw an opaque "Cannot read properties of
    // undefined" either.
    const content = response.output?.message?.content;
    if (!content || content.length === 0) {
      throw new Error("Bedrock Converse response had no content blocks");
    }
    const text = content[0]?.text;
    if (text === undefined) {
      throw new Error("Bedrock Converse response's first content block had no text");
    }
    return text;
  }
}
