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

import type { StepAiChoice } from "./step-ai.store";

const CHOICES: StepAiChoice[] = ["connector", "claudeCode", "codex", "cursor", "gemini", "claudeDesktop", "skip"];

const DOCS_LINKS: Record<Exclude<StepAiChoice, "skip">, string> = {
  claudeCode: "/docs/connect-cli#claude-code",
  claudeDesktop: "/docs/connect-cli#claude-desktop-config-file",
  codex: "/docs/connect-cli#codex",
  connector: "/docs/connect-custom-connector",
  cursor: "/docs/connect-cli#cursor",
  gemini: "/docs/connect-cli#gemini-cli",
};

export const StepAi = observer(() => {
  const t = useTranslations();
  const locale = useLocale();
  const { onboardingWizardStore, stepAiStore } = useRootStore();
  const { choice, apiKey, isCreating, hasError, canContinue } = stepAiStore;

  const mcpUrl = useMemo(() => {
    if (choice !== "connector") return "";
    return `${window.location.origin}/api/v1/mcp`;
  }, [choice]);

  const installSnippet = useMemo(() => {
    if (!choice || choice === "connector" || choice === "skip" || !apiKey) return "";
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
            {t(`OnboardingWizard.ai.choices.${key}`)}
          </button>
        ))}
      </div>

      {choice === "connector" && (
        <div className="flex flex-1 min-w-0 flex-col gap-1.5">
          <p className="text-sm font-medium">{t("OnboardingWizard.ai.connector.urlLabel")}</p>

          <CopyableCode value={mcpUrl} />

          <Button asChild className="w-fit" size="sm">
            <a
              href={`https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Customermates&connectorUrl=${encodeURIComponent(mcpUrl)}`}
              rel="noreferrer noopener"
              target="_blank"
            >
              {t("OnboardingWizard.ai.connector.claudeButton")}
            </a>
          </Button>

          <p className="text-xs text-muted-foreground">{t("OnboardingWizard.ai.connector.chatgptHint")}</p>

          <a
            className="text-xs text-primary underline w-fit"
            href={`/${locale}${DOCS_LINKS[choice]}`}
            rel="noreferrer"
            target="_blank"
          >
            {t("OnboardingWizard.ai.fullGuide")}
          </a>
        </div>
      )}

      {choice && choice !== "connector" && choice !== "skip" && !apiKey && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("OnboardingWizard.ai.createKeyIntro")}</p>

          <Button disabled={isCreating} size="sm" type="button" onClick={() => void stepAiStore.createApiKey()}>
            {isCreating && <Loader2 className="size-4 animate-spin" />}

            {t("OnboardingWizard.ai.createKey")}
          </Button>

          {hasError && <p className="text-xs text-destructive">{t("OnboardingWizard.ai.errors.createFailed")}</p>}
        </div>
      )}

      {choice && choice !== "connector" && choice !== "skip" && apiKey && (
        <div className="flex flex-1 min-w-0 flex-col gap-1.5">
          <p className="text-sm font-medium">
            {t("OnboardingWizard.ai.install.label", {
              tool: t(`OnboardingWizard.ai.choices.${choice}`),
            })}
          </p>

          <p className="text-xs text-muted-foreground">{t(`OnboardingWizard.ai.install.instruction.${choice}`)}</p>

          <CopyableCode value={installSnippet} />

          <a
            className="text-xs text-primary underline w-fit"
            href={`/${locale}${DOCS_LINKS[choice]}`}
            rel="noreferrer"
            target="_blank"
          >
            {t("OnboardingWizard.ai.fullGuide")}
          </a>
        </div>
      )}

      {choice === "skip" && <p className="text-xs text-muted-foreground">{t("OnboardingWizard.ai.skipHint")}</p>}

      <div className="flex justify-end gap-4 pt-2">
        <Button
          disabled={!canContinue || onboardingWizardStore.isSubmitting}
          type="button"
          onClick={() => void onboardingWizardStore.complete()}
        >
          {t("OnboardingWizard.finish")}
        </Button>
      </div>
    </div>
  );
});
