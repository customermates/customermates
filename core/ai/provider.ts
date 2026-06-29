import type { LanguageModel } from "ai";

import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

import { env } from "@/env";

/**
 * Provider selection for the in-app agent chat.
 *
 * The agent is provider-agnostic: the active provider is chosen from whichever
 * API key is configured in the environment, with Anthropic preferred when both
 * are present (decision: the product is Claude-first). Both the provider and the
 * model id are swappable via env, so this is the only place that knows about a
 * concrete LLM vendor — keep that knowledge out of the route, tools, and UI.
 */
export type AgentProvider = "anthropic" | "openai";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";
const DEFAULT_OPENAI_MODEL = "gpt-4o";

/**
 * The @ai-sdk/anthropic provider appends "/messages" to ANTHROPIC_BASE_URL, so it
 * expects the base to include the API version path (".../v1"). Some environments
 * set ANTHROPIC_BASE_URL to the bare host ("https://api.anthropic.com"), which
 * would produce "/messages" (404). Normalize it so either form works.
 */
function resolveAnthropicBaseURL(): string {
  const raw = env.ANTHROPIC_BASE_URL?.trim();
  if (!raw) return "https://api.anthropic.com/v1";

  const trimmed = raw.replace(/\/+$/, "");
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

const anthropic = createAnthropic({ baseURL: resolveAnthropicBaseURL() });

export function getConfiguredProvider(): AgentProvider | null {
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";
  return null;
}

/** Whether at least one provider key is set — drives the "AI not configured" UI state. */
export function isAgentConfigured(): boolean {
  return getConfiguredProvider() !== null;
}

export class AgentNotConfiguredError extends Error {
  constructor() {
    super("No agent model provider is configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    this.name = "AgentNotConfiguredError";
  }
}

export function getAgentModel(): LanguageModel {
  const provider = getConfiguredProvider();

  if (provider === "anthropic") return anthropic(env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL);
  if (provider === "openai") return openai(env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL);

  throw new AgentNotConfiguredError();
}
