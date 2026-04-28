"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyableCode } from "@/components/shared/copyable-code";
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";
import { getMcpSetupPrompt } from "@/features/docs/mcp-setup-prompt";

import { completeOnboardingWizardAction } from "../actions";

import type { StepAiChoice } from "./step-ai.store";

const CHOICES: StepAiChoice[] = ["claudeCode", "claudeDesktop", "codex", "cursor", "gemini", "skip"];

function toDocsSlug(choice: Exclude<StepAiChoice, "skip">): string {
  return `mcp-connect-${choice.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
}

export const StepAi = observer(() => {
  const t = useTranslations("OnboardingWizard.ai");
  const tw = useTranslations("OnboardingWizard");
  const locale = useLocale();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const { choice, apiKey, isCreating, hasError, canContinue } = stepAiStore;

  const setupPrompt = useMemo(() => getMcpSetupPrompt(locale === "de" ? "de" : "en"), [locale]);

  const installSnippet = useMemo(() => {
    if (!choice || choice === "skip" || !apiKey) return "";
    return getMcpInstallSnippet(choice, apiKey, window.location.origin);
  }, [choice, apiKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {CHOICES.map((key) => (
          <button
            key={key}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium text-left transition-colors",
              choice === key ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
            )}
            type="button"
            onClick={() => stepAiStore.setChoice(key)}
          >
            {t(`choices.${key}`)}
          </button>
        ))}
      </div>

      {choice && choice !== "skip" && !apiKey && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("createKeyIntro")}</p>

          <Button disabled={isCreating} size="sm" type="button" onClick={() => void stepAiStore.createApiKey()}>
            {isCreating && <Loader2 className="size-4 animate-spin" />}

            {t("createKey")}
          </Button>

          {hasError && <p className="text-xs text-destructive">{t("errors.createFailed")}</p>}
        </div>
      )}

      {choice && choice !== "skip" && apiKey && (
        <ol className="flex flex-col gap-4">
          <li className="flex gap-3">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold mt-0.5">
              1
            </div>

            <div className="flex flex-1 min-w-0 flex-col gap-1.5">
              <p className="text-sm font-medium">{t("install.label", { tool: t(`choices.${choice}`) })}</p>

              <p className="text-xs text-muted-foreground">{t(`install.instruction.${choice}`)}</p>

              <CopyableCode value={installSnippet} />

              <a
                className="text-xs text-primary underline w-fit"
                href={`/${locale}/docs/${toDocsSlug(choice)}`}
                rel="noreferrer"
                target="_blank"
              >
                {t("fullGuide")}
              </a>
            </div>
          </li>

          <li className="flex gap-3">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold mt-0.5">
              2
            </div>

            <div className="flex flex-1 min-w-0 flex-col gap-1.5">
              <p className="text-sm font-medium">{t("promptLabel")}</p>

              <p className="text-xs text-muted-foreground">{t("promptHint")}</p>

              <CopyableCode className="max-h-48 overflow-y-auto" value={setupPrompt} />
            </div>
          </li>
        </ol>
      )}

      {choice === "skip" && <p className="text-xs text-muted-foreground">{t("skipHint")}</p>}

      <div className="flex justify-end gap-4 pt-2">
        <Button
          disabled={!canContinue || onboardingWizardStore.isSubmitting}
          type="button"
          onClick={() => {
            onboardingWizardStore.setIsSubmitting(true);
            void completeOnboardingWizardAction().finally(() => onboardingWizardStore.setIsSubmitting(false));
          }}
        >
          {tw("finish")}
        </Button>
      </div>
    </div>
  );
});
