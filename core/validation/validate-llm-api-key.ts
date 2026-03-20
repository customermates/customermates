import type { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

type LlmProviderKeys = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
};

async function validateSingleLlmApiKey(
  provider: "anthropic" | "openai",
  apiKey: string,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): Promise<void> {
  if (!apiKey.trim()) return;

  let valid = false;
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      valid = res.ok;
    } else {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
      });
      valid = res.ok;
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.llmApiKeyInvalid },
      path,
    });
  }
}

export async function validateLlmApiKey(llm: LlmProviderKeys, ctx: z.RefinementCtx): Promise<void> {
  const openaiApiKey = llm.openaiApiKey?.trim() ?? "";
  const anthropicApiKey = llm.anthropicApiKey?.trim() ?? "";

  await Promise.all([
    openaiApiKey ? validateSingleLlmApiKey("openai", openaiApiKey, ctx, ["openaiApiKey"]) : Promise.resolve(),
    anthropicApiKey
      ? validateSingleLlmApiKey("anthropic", anthropicApiKey, ctx, ["anthropicApiKey"])
      : Promise.resolve(),
  ]);
}
