import { z } from "zod";

export const AiConnectionSelectionSchema = z.strictObject({
  route: z.discriminatedUnion("screen", [
    z.strictObject({ screen: z.literal("providers") }),
    z.strictObject({ screen: z.literal("claude") }),
    z.strictObject({ screen: z.literal("openai") }),
    z.strictObject({
      screen: z.literal("setup"),
      provider: z.enum(["cursor", "gemini"]),
    }),
  ]),
  selectedProvider: z.enum(["claude", "openai", "cursor", "gemini"]).nullable(),
  claudeMethod: z.enum(["account", "local"]).nullable(),
  claudeClient: z.enum(["claudeCode", "claudeDesktop"]).nullable(),
  openAiMethod: z.enum(["chatgpt", "codex"]).nullable(),
  apiKeyIds: z.partialRecord(
    z.enum(["claudeCode", "claudeDesktop", "codex", "cursor", "gemini"]),
    z.string().min(1).max(100),
  ),
});

export type AiConnectionSelection = z.infer<typeof AiConnectionSelectionSchema>;

export const OnboardingWizardProgressSchema = z.strictObject({
  step: z.enum(["invite", "ai"]),
  inviteTab: z.enum(["link", "email"]),
  ai: AiConnectionSelectionSchema,
});

export type OnboardingWizardProgress = z.infer<typeof OnboardingWizardProgressSchema>;

export function initialAiConnectionSelection(): AiConnectionSelection {
  return {
    route: { screen: "providers" },
    selectedProvider: null,
    claudeMethod: null,
    claudeClient: null,
    openAiMethod: null,
    apiKeyIds: {},
  };
}

export function readOnboardingWizardProgress(value: unknown): OnboardingWizardProgress {
  const parsed = OnboardingWizardProgressSchema.safeParse(value);
  return parsed.success ? parsed.data : { step: "invite", inviteTab: "link", ai: initialAiConnectionSelection() };
}
