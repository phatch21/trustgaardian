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
//
// Error visibility: every failure mode below is logged here, at the
// source, before it propagates — an auth failure, a throttled request, or
// a malformed call must never be indistinguishable from a model producing
// unparseable text once it reaches agent/parse.ts's invalid_json. Nothing
// here is swallowed: every console.error is followed by a throw (the SDK
// error rethrown unchanged, or a new descriptive one), so callers' error
// handling is unaffected — this only adds visibility, upstream of
// whatever eventually turns "the agent call failed" into a user-facing
// result.

import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { AgentClient, AgentPrompt } from "./types.js";

// AWS SDK v3 service exceptions (AccessDeniedException, ThrottlingException,
// ValidationException, ExpiredTokenException, ...) are ordinary Errors with
// two extra properties this codebase doesn't otherwise depend on: `name`
// carries the real exception type, and `$metadata` carries request-tracing
// fields (httpStatusCode, requestId) useful for filing a support case.
// Checked structurally rather than importing every specific exception
// class, the same way checkout/attempt.ts narrows Database.SqliteError.
function isAwsServiceError(error: unknown): error is Error & { $metadata?: unknown } {
  return error instanceof Error && "$metadata" in error;
}

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
      //
      // maxTokens raised from 1500 to 4096 (2026-09-24): 1500 truncates a
      // real cart response well before the model finishes — a 16-item
      // cart with a "reasoning" string per item (agent/prompt.ts's
      // required output shape) runs well past 1500 tokens, and a
      // response cut off mid-JSON is exactly what parseCartResponse's
      // invalid_json rejection looks like from the outside, in the
      // console alongside a genuine refusal or malformed output. See the
      // stopReason logging just below this call for how to tell them
      // apart when it happens. scripts/spike-injection.ts is a separate,
      // throwaway script with its own inferenceConfig — not changed here.
      inferenceConfig: { maxTokens: 4096, temperature: 0 },
    });

    let response;
    try {
      response = await this.client.send(command);
    } catch (error) {
      // The one place this file catches anything, and the first point in
      // the whole request -> response path where this error is caught at
      // all — orchestrator/run.ts and web/handlers.ts both let it
      // propagate untouched. Logged here as explicit, labeled fields
      // (not folded into a sentence) so an auth failure, a throttle, and
      // a model producing bad output are never one indistinguishable
      // blob in the console. `code` is AWS SDK v3's name for what AWS
      // calls the error code (e.g. AccessDeniedException,
      // ThrottlingException) — SDK v3 exceptions carry it as `.name`,
      // not a separate `.code` field. Rethrown as-is afterward: this is
      // visibility, not handling, and the user-facing message downstream
      // does not change.
      const name = error instanceof Error ? error.name : typeof error;
      const message = error instanceof Error ? error.message : String(error);
      const metadata = isAwsServiceError(error) ? error.$metadata : undefined;
      console.error("[BedrockAgentClient] Converse call failed:", {
        code: name,
        message,
        requestId: (metadata as { requestId?: string } | undefined)?.requestId,
        httpStatusCode: (metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode,
      });
      throw error;
    }

    // response.output.message.content[0].text, but every link in that
    // chain is optional in the SDK's types — a missing or empty content
    // array is a real failure (the model returned nothing usable), not
    // something to paper over with a default empty string, and not
    // something to let throw an opaque "Cannot read properties of
    // undefined" either.
    const content = response.output?.message?.content;
    if (!content || content.length === 0) {
      console.error(
        `[BedrockAgentClient] Converse response had no content blocks (stopReason: ${response.stopReason ?? "unknown"})`,
      );
      throw new Error("Bedrock Converse response had no content blocks");
    }
    const text = content[0]?.text;
    if (text === undefined) {
      console.error(
        `[BedrockAgentClient] Converse response's first content block had no text (stopReason: ${response.stopReason ?? "unknown"})`,
        content[0],
      );
      throw new Error("Bedrock Converse response's first content block had no text");
    }

    // Diagnostic only — never affects what's returned or thrown. complete()
    // returns text regardless of whether it parses; that decision belongs
    // to agent/parse.ts's parseCartResponse, several layers downstream,
    // which is fail-closed by design and rejects it as invalid_json either
    // way. What this codebase can't otherwise tell apart, once that
    // rejection surfaces, is *why* the text isn't JSON: a response cut off
    // by maxTokens (stopReason: "max_tokens") reads very differently from
    // a safety refusal or guardrail intervention (stopReason:
    // "content_filtered" / "guardrail_intervened") or the model simply
    // finishing its turn with malformed output (stopReason: "end_turn").
    // A direct JSON.parse here is deliberately not parseCartResponse's
    // full extraction logic (which also tries a markdown-fence/prose
    // fallback) — this only needs to catch the common case well enough to
    // log before the text moves on.
    try {
      JSON.parse(text);
    } catch {
      console.error("[BedrockAgentClient] response text is not valid JSON:", {
        stopReason: response.stopReason ?? "unknown",
        textLength: text.length,
        textPreview: text.length > 120 ? `${text.slice(0, 60)}…${text.slice(-60)}` : text,
      });
    }

    return text;
  }
}
