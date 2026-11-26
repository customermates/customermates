import { z } from "zod";

export type AiConnectionSelection = {
  route:
    | { screen: "providers" | "claude" | "openai" | "other" }
    | { screen: "app"; provider: "grok" | "langdock" }
    | { screen: "setup"; provider: "cursor" | "gemini" };
  selectedProvider: "claude" | "openai" | "cursor" | "gemini" | "grok" | "langdock" | null;
  claudeMethod: "account" | "local" | null;
  claudeClient: "claudeCode" | "claudeDesktop" | null;
  openAiMethod: "chatgpt" | "codex" | null;
  apiKeyIds: Partial<Record<"claudeCode" | "claudeDesktop" | "codex" | "cursor" | "gemini", string>>;
};

const progressShape = {
  step: z.enum(["invite", "channel"]),
  inviteTab: z.enum(["link", "email"]),
};

export const OnboardingWizardProgressSchema = z.strictObject(progressShape);

export type OnboardingWizardProgress = z.infer<typeof OnboardingWizardProgressSchema>;

const StoredOnboardingWizardProgressSchema = z.object(progressShape);

export function readOnboardingWizardProgress(value: unknown): OnboardingWizardProgress {
  const parsed = StoredOnboardingWizardProgressSchema.safeParse(value);
  return parsed.success ? parsed.data : { step: "invite", inviteTab: "link" };
}
