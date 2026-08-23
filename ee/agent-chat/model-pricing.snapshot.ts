export const MODEL_PRICING_SNAPSHOT = {
  source: "https://ai-gateway.vercel.sh/v1/models/{model}/endpoints",
  fetchedAt: "2026-08-23T17:11:30Z",
  endpoints: [
    {
      modelId: "openai/gpt-5.6-luna",
      providerNativeModelId: "gpt-5.6-luna",
      provider: "openai",
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
      provider: "openai",
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
          costUsdPerToken: "0.000000005",
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
