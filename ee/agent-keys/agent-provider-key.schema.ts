import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { zx } from "@/core/validation/validation.utils";

import { AGENT_PROVIDERS } from "./agent-provider-models";

export const AGENT_PROVIDER_KEY_LABEL_MAX_CHARS = 80;
export const AGENT_PROVIDER_KEY_MAX_CHARS = 512;
export const AGENT_PROVIDER_MODEL_MAX_CHARS = 80;

export const AgentProviderSchema = z.enum(AGENT_PROVIDERS);

export const AgentProviderKeyDtoSchema = z.object({
  id: z.uuid(),
  provider: AgentProviderSchema,
  label: z.string(),
  last4: z.string(),
  defaultModel: z.string().nullable(),
  validatedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type AgentProviderKeyDto = Data<typeof AgentProviderKeyDtoSchema>;

export const AgentProviderKeyListSchema = z.object({ keys: z.array(AgentProviderKeyDtoSchema) });
export type AgentProviderKeyList = Data<typeof AgentProviderKeyListSchema>;

export const SaveAgentProviderKeySchema = z
  .object({
    provider: AgentProviderSchema,
    label: zx.nonBlankText(AGENT_PROVIDER_KEY_LABEL_MAX_CHARS),
    apiKey: z.string().trim().min(8).max(AGENT_PROVIDER_KEY_MAX_CHARS).regex(/^\S+$/),
    defaultModel: z.string().trim().min(1).max(AGENT_PROVIDER_MODEL_MAX_CHARS).optional(),
  })
  .strict();
export type SaveAgentProviderKeyData = z.output<typeof SaveAgentProviderKeySchema>;
export type SaveAgentProviderKeyInput = z.input<typeof SaveAgentProviderKeySchema>;

export const DeleteAgentProviderKeySchema = z.object({ id: z.uuid() }).strict();
export type DeleteAgentProviderKeyData = z.infer<typeof DeleteAgentProviderKeySchema>;

export const TestAgentProviderKeySchema = z.object({ id: z.uuid() }).strict();
export type TestAgentProviderKeyData = z.infer<typeof TestAgentProviderKeySchema>;

export const DeleteAgentProviderKeyResultSchema = z.object({ id: z.uuid() });
export type DeleteAgentProviderKeyResult = Data<typeof DeleteAgentProviderKeyResultSchema>;
