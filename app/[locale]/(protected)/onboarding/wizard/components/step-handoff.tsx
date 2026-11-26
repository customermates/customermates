"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, CircleCheck, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/core/utils/clipboard";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { useAgentStatusPolling } from "./agent-status-polling";
import { agentLaunchUrl } from "./agent-launch-url";
import { useSelectedAgentName } from "./use-selected-agent-name";
import { WIZARD_FOOTER_CLASS, WIZARD_FOOTER_GROUP_CLASS } from "./wizard-footer";

const COPIED_RESET_MS = 2_500;

function useHandoffPrompt(workspaceName: string): string {
  const t = useTranslations();
  return workspaceName
    ? t("OnboardingWizard.handoff.prompt", { workspace: workspaceName })
    : t("OnboardingWizard.handoff.promptGeneric");
}

function StatusRow({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {done ? (
        <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
      ) : (
        <Loader2
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
      )}

      <span className={cn("min-w-0 text-pretty", done ? "text-foreground" : "text-muted-foreground")}>{children}</span>
    </li>
  );
}

export const StepHandoff = observer(({ workspaceName }: { workspaceName: string }) => {
  const t = useTranslations();
  const { onboardingWizardStore: store, stepAiStore } = useRootStore();
  const agent = useSelectedAgentName();
  const prompt = useHandoffPrompt(workspaceName);
  const launchUrl = agentLaunchUrl(stepAiStore.selectedProvider, stepAiStore.openAiMethod, prompt);
  const [copied, setCopied] = useState(false);
  useAgentStatusPolling(store, !store.agentChanged);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => setCopied(await copyToClipboard(prompt).catch(() => false));

  return (
    <div className="flex flex-col gap-4">
      <p
        aria-label={t("OnboardingWizard.handoff.promptLabel")}
        className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-foreground"
        id="onboarding-handoff-prompt"
      >
        {prompt}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {launchUrl && agent ? (
          <Button asChild className="min-h-11">
            <a href={launchUrl} id="onboarding-handoff-open" rel="noopener noreferrer" target="_blank">
              {t("OnboardingWizard.handoff.openIn", { agent })}

              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          </Button>
        ) : null}

        <Button
          className={cn("min-h-11", !(launchUrl && agent) && "sm:col-span-2")}
          id="onboarding-handoff-copy"
          type="button"
          variant={launchUrl && agent ? "secondary" : "default"}
          onClick={() => runUserAction(copy)}
        >
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}

          {copied ? t("OnboardingWizard.handoff.copied") : t("OnboardingWizard.handoff.copy")}
        </Button>
      </div>

      <ul
        aria-label={t("OnboardingWizard.connect.statusLabel")}
        className="flex flex-col gap-2"
        id="onboarding-agent-change"
        role="status"
      >
        <StatusRow done={store.agentConnected}>
          {store.agentConnected
            ? agent
              ? t("OnboardingWizard.handoff.connected", { agent })
              : t("OnboardingWizard.handoff.connectedGeneric")
            : agent
              ? t("OnboardingWizard.connect.waiting", { agent })
              : t("OnboardingWizard.connect.waitingGeneric")}
        </StatusRow>

        <StatusRow done={store.agentChanged}>
          {store.agentChanged
            ? t("OnboardingWizard.handoff.changed")
            : agent
              ? t("OnboardingWizard.handoff.watching", { agent })
              : t("OnboardingWizard.handoff.watchingGeneric")}
        </StatusRow>
      </ul>
    </div>
  );
});

export const StepHandoffFooter = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();

  return (
    <AppCardFooter className={WIZARD_FOOTER_CLASS}>
      <Button
        className="min-h-11"
        disabled={store.isBusy || store.isFirstStep}
        id="onboarding-back"
        type="button"
        variant="ghost"
        onClick={() => runUserAction(store.back)}
      >
        {t("Common.actions.back")}
      </Button>

      <div className={cn(WIZARD_FOOTER_GROUP_CLASS, "justify-end")}>
        <Button
          className="min-h-11"
          disabled={store.isBusy}
          id="onboarding-handoff-continue"
          type="button"
          onClick={() => runUserAction(store.advance)}
        >
          {store.isLastStep ? t("OnboardingWizard.finish") : t("OnboardingWizard.continue")}

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
