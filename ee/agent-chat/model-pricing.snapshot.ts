export const MODEL_PRICING_SNAPSHOT = {
  source: "https://ai-gateway.vercel.sh/v1/models and https://ai-gateway.vercel.sh/v1/models/{model}/endpoints",
  fetchedAt: "2026-09-13T13:55:33Z",
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
      modelId: "google/gemini-3.5-flash",
      providerNativeModelId: "gemini-3.5-flash",
      provider: "vertex",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 64000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "14",
      prompt: [
        {
          costUsdPerToken: "0.00000165",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000099",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000165",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "google/gemini-3.6-flash",
      providerNativeModelId: "gemini-3.6-flash",
      provider: "vertex",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 64000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "14",
      prompt: [
        {
          costUsdPerToken: "0.000000825",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.000004125",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.0000000825",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "google/gemini-3.8-flash",
      providerNativeModelId: "gemini-3.8-flash",
      provider: "vertex",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 65536,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "14",
      prompt: [
        {
          costUsdPerToken: "0.000000825",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.000004125",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.0000000825",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "google/gemini-3.1-flash-lite",
      providerNativeModelId: "gemini-3.1-flash-lite",
      provider: "vertex",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 65000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "14",
      prompt: [
        {
          costUsdPerToken: "0.000000275",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00000165",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.0000000275",
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
      modelId: "openai/gpt-5.6-terra",
      providerNativeModelId: "gpt-5.6-terra",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 1050000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.000002",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.000004",
          minPromptTokens: 272000,
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.000012",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.000018",
          minPromptTokens: 272000,
        },
      ],
      inputCacheRead: [
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
      inputCacheWrite: [
        {
          costUsdPerToken: "0.0000025",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.000005",
          minPromptTokens: 272000,
        },
      ],
    },
    {
      modelId: "openai/gpt-5.6-sol",
      providerNativeModelId: "gpt-5.6-sol",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 1050000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.000005",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.00001",
          minPromptTokens: 272000,
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00003",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.000045",
          minPromptTokens: 272000,
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.0000005",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.000001",
          minPromptTokens: 272000,
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.00000625",
          minPromptTokens: 0,
          maxPromptTokens: 272000,
        },
        {
          costUsdPerToken: "0.0000125",
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
    {
      modelId: "openai/gpt-5-mini",
      providerNativeModelId: "gpt-5-mini",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 400000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000025",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.000002",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000003",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "openai/gpt-5.4-mini",
      providerNativeModelId: "gpt-5.4-mini",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 400000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000075",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000045",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000075",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "openai/gpt-5.4-nano",
      providerNativeModelId: "gpt-5.4-nano",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 400000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.0000002",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00000125",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000002",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "anthropic/claude-haiku-4.5",
      providerNativeModelId: "claude-haiku-4.5",
      provider: "bedrock",
      inferenceRegion: "eu",
      contextLength: 200000,
      maxCompletionTokens: 64000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "10",
      prompt: [
        {
          costUsdPerToken: "0.0000011",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000055",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000011",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.000001375",
        },
      ],
    },
    {
      modelId: "anthropic/claude-sonnet-5",
      providerNativeModelId: "claude-sonnet-5",
      provider: "bedrock",
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
          costUsdPerToken: "0.00000022",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.00000275",
        },
      ],
    },
    {
      modelId: "anthropic/claude-opus-5",
      providerNativeModelId: "claude-opus-5",
      provider: "bedrock",
      inferenceRegion: "eu",
      contextLength: 1000000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "10",
      prompt: [
        {
          costUsdPerToken: "0.0000055",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000275",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000055",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0.000006875",
        },
      ],
    },
    {
      modelId: "deepseek/deepseek-v4-flash",
      providerNativeModelId: "deepseek-v4-flash",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 1000000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000019",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00000051",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000028",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "deepseek/deepseek-v4-pro",
      providerNativeModelId: "deepseek-v4-pro",
      provider: "azure",
      inferenceRegion: null,
      contextLength: 1000000,
      maxCompletionTokens: 128000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000174",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.00000348",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.000000145",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "zai/glm-5.3-flash",
      providerNativeModelId: "glm-5.3-flash",
      provider: "baseten",
      inferenceRegion: null,
      contextLength: 1000000,
      maxCompletionTokens: 131000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000015",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000005",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000003",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "zai/glm-5.3",
      providerNativeModelId: "glm-5.3",
      provider: "baseten",
      inferenceRegion: null,
      contextLength: 1000000,
      maxCompletionTokens: 1000000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.0000014",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000044",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000014",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "moonshotai/kimi-k2.7-code",
      providerNativeModelId: "kimi-k2.7-code",
      provider: "baseten",
      inferenceRegion: null,
      contextLength: 256000,
      maxCompletionTokens: 32768,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.00000095",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.000004",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.00000016",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "mistral/mistral-large-3",
      providerNativeModelId: "mistral-large-3",
      provider: "mistral",
      inferenceRegion: null,
      contextLength: 256000,
      maxCompletionTokens: 256000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.0000005",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000015",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.0000005",
        },
      ],
      inputCacheWrite: [
        {
          costUsdPerToken: "0",
        },
      ],
    },
    {
      modelId: "alibaba/qwen3-coder-next",
      providerNativeModelId: "qwen3-coder-next",
      provider: "bedrock",
      inferenceRegion: null,
      contextLength: 256000,
      maxCompletionTokens: 256000,
      requestUsd: "0",
      webSearchUsdPerThousandCalls: "0",
      prompt: [
        {
          costUsdPerToken: "0.0000005",
        },
      ],
      completion: [
        {
          costUsdPerToken: "0.0000012",
        },
      ],
      inputCacheRead: [
        {
          costUsdPerToken: "0.0000005",
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
