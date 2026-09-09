export const MODEL_PRICING_SNAPSHOT = {
  source: "https://ai-gateway.vercel.sh/v1/models and https://ai-gateway.vercel.sh/v1/models/{model}/endpoints",
  fetchedAt: "2026-09-09T15:13:05Z",
  endpoints: [
    {
      modelId: "google/gemini-3.5-flash-lite",
      providerNativeModelId: "gemini-3.5-flash-lite",
      provider: "vertex",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 65000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "14",
      prompt: [
        {
          costUsdPerToken: "0.00000033",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00000275",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000033",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "openai/gpt-5.6-luna",
      providerNativeModelId: "gpt-5.6-luna",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 1050000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.0000002",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.0000004",
          minPromptTokens: 272000,
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000012",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.0000018",
          minPromptTokens: 272000,
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000002",
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.00000004",
          minPromptTokens: 272000,
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.00000025",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.0000005",
          minPromptTokens: 272000,
        },
      ],
    },
    {
      modelId: "openai/gpt-5-nano",
      providerNativeModelId: "gpt-5-nano",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 400000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000005",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000004",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000001",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
  ],
} as const;
