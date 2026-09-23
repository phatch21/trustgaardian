// Real Bedrock-backed AgentClient. This is the only file in /agent that
// imports @aws-sdk/client-bedrock-runtime — everything else in the module
// talks to AgentClient, not to this.

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
      throw new Error("BedrockAgentClient requires a model id: pass one or set BEDROCK_MODEL_ID.");
    }
    this.modelId = modelId;
    this.client = new BedrockRuntimeClient(options.region ? { region: options.region } : {});
  }

  async complete(prompt: AgentPrompt): Promise<string> {
    const command = new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: prompt.system }],
      messages: [{ role: "user", content: [{ text: prompt.user }] }],
      inferenceConfig: { maxTokens: 1500, temperature: 0 },
    });

    const response = await this.client.send(command);
    const blocks = response.output?.message?.content ?? [];
    return blocks.map((block) => block.text ?? "").join("");
  }
}
