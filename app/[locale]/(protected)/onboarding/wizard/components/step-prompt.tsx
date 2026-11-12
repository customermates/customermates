"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, CircleCheck, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/core/utils/clipboard";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { useAgentStatusPolling } from "./agent-status-polling";
import { promptChecklist } from "./onboarding-copy";
import { useSelectedAgentName } from "./use-selected-agent-name";

const COPIED_RESET_MS = 2_500;

type CopyState = "idle" | "copied" | "failed";

function useAgentLaunchUrl(): string | null {
  const { stepAiStore } = useRootStore();
  if (stepAiStore.selectedProvider === "claude") return "https://claude.ai/new";
  if (stepAiStore.selectedProvider === "openai" && stepAiStore.openAiMethod !== "codex") return "https://chatgpt.com/";
  return null;
}

export const StepPrompt = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const agent = useSelectedAgentName();
  const promptRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  useAgentStatusPolling(store, !store.agentChanged);

  useEffect(() => {
    if (store.promptState === "idle" && store.selectedTemplate !== null)
      void store.loadPrompt().catch(reportApplicationError);
  }, [store, store.promptState, store.selectedTemplate]);

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(() => setCopyState("idle"), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const copy = async () => {
    const prompt = store.promptText;
    if (prompt === null) return;
    const copied = await copyToClipboard(prompt).catch(() => false);
    setCopyState(copied ? "copied" : "failed");
    if (!copied && promptRef.current) globalThis.getSelection()?.selectAllChildren(promptRef.current);
  };

  const ready = store.promptState === "ready" && store.promptText !== null;

  return (
    <div className="flex flex-col gap-4">
      {store.promptState === "failed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <span className="min-w-0 flex-1">{t("OnboardingWizard.prompt.failed")}</span>

          <Button size="sm" type="button" variant="secondary" onClick={store.retryPrompt}>
            {t("OnboardingWizard.prompt.retry")}
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={promptRef}
            aria-busy={!ready}
            aria-label={t("OnboardingWizard.prompt.promptLabel")}
            aria-multiline="true"
            aria-readonly="true"
            className={cn(
              "max-h-56 min-h-32 overflow-auto rounded-lg border border-border bg-muted/60 p-4 pr-32 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
              !ready && "animate-pulse motion-reduce:animate-none",
            )}
            id="onboarding-template-prompt"
            role="textbox"
            tabIndex={0}
          >
            {ready ? store.promptText : t("OnboardingWizard.prompt.loading")}
          </div>

          <Button
            className="absolute top-3 right-3"
            disabled={!ready}
            id="onboarding-template-copy"
            size="sm"
            type="button"
            onClick={() => void copy()}
          >
            {copyState === "copied" ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}

            {copyState === "copied" ? t("OnboardingWizard.prompt.copied") : t("OnboardingWizard.prompt.copy")}
          </Button>
        </div>
      )}

      <p aria-live="polite" className="text-xs text-muted-foreground" role="status">
        {copyState === "failed" ? t("OnboardingWizard.prompt.copyFailed") : ""}
      </p>

      <ol
        aria-label={t("OnboardingWizard.prompt.stepsLabel")}
        className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3"
      >
        {promptChecklist(t, agent).map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-foreground"
            >
              {index + 1}
            </span>

            {label}
          </li>
        ))}
      </ol>

      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-3 text-sm",
          store.agentChanged ? "border-success/40 bg-success/5" : "border-dashed border-border bg-muted/30",
        )}
        id="onboarding-agent-change"
        role="status"
      >
        {store.agentChanged ? (
          <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
        ) : (
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 animate-pulse rounded-full bg-warning motion-reduce:animate-none"
          />
        )}

        <span className="min-w-0 text-muted-foreground">
          {store.agentChanged ? t("OnboardingWizard.prompt.changed") : t("OnboardingWizard.prompt.watching")}
        </span>
      </div>
    </div>
  );
});

export const StepPromptFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const agent = useSelectedAgentName();
  const launchUrl = useAgentLaunchUrl();
  const busy = store.isSubmitting || store.isSaving || store.isInitializing;

  return (
    <AppCardFooter className="justify-between">
      <Button
        disabled={busy || store.isFirstStep}
        id="onboarding-prompt-back"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(store.back)}
      >
        {t("Common.actions.back")}
      </Button>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {launchUrl && agent ? (
          <Button asChild variant="secondary">
            <a href={launchUrl} rel="noopener noreferrer" target="_blank">
              {t("OnboardingWizard.prompt.openIn", { agent })}

              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </Button>
        ) : null}

        <Button
          disabled={busy}
          id="onboarding-prompt-finish"
          type="button"
          onClick={() => runUserAction(() => store.complete())}
        >
          {t("OnboardingWizard.prompt.go")}

          {store.isSubmitting ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <ArrowRight aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>
    </AppCardFooter>
  );
});
