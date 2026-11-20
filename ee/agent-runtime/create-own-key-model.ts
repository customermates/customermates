import type { LanguageModel } from "ai";
import type { AgentProviderId } from "@/ee/agent-keys/agent-provider-models";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

export type OwnKeyModelFactory = (provider: AgentProviderId, apiKey: string, modelId: string) => LanguageModel;

export const createOwnKeyModel: OwnKeyModelFactory = (provider, apiKey, modelId) => {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
  }
};
