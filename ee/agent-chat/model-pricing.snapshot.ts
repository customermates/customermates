export const MODEL_PRICING_SNAPSHOT = {
  source: "https://ai-gateway.vercel.sh/v1/models and https://ai-gateway.vercel.sh/v1/models/{model}/endpoints",
  fetchedAt: "2026-10-11T14:16:52Z",
  endpoints: [
    {
      modelId: "anthropic/claude-haiku-5.5",
      providerNativeModelId: "claude-haiku-5.5",
      provider: "vertexAnthropic",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "10",
      prompt: [
        {
          costUsdPerToken: "0.00000011",
          minPromptTokens: 0,
          maxPromptTokens: 100001,
        },
        {
          costUsdPerToken: "0.00000055",
          minPromptTokens: 100001,
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00000055",
          minPromptTokens: 0,
          maxPromptTokens: 100001,
        },
        {
          costUsdPerToken: "0.00000275",
          minPromptTokens: 100001,
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000011",
          minPromptTokens: 0,
          maxPromptTokens: 100001,
        },
        {
          costUsdPerToken: "0.000000055",
          minPromptTokens: 100001,
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.0000001375",
          minPromptTokens: 0,
          maxPromptTokens: 100001,
        },
        {
          costUsdPerToken: "0.0000006875",
          minPromptTokens: 100001,
        },
      ],
    },
    {
      modelId: "anthropic/claude-sonnet-5.5",
      providerNativeModelId: "claude-sonnet-5.5",
      provider: "vertexAnthropic",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "10",
      prompt: [
        {
          costUsdPerToken: "0.0000022",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.000011",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000011",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.00000275",
        },
      ],
    },
    {
      modelId: "typesafe-ai/jev",
      providerNativeModelId: "jev",
      provider: "digitalocean",
      inferenceRegion: null,
      contextLength: 32000,
      maxCompletionTokens: null,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.000000042",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000042",
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
