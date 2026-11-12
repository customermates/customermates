"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { useAgentStatusPolling } from "./agent-status-polling";
import { useSelectedAgentName } from "./use-selected-agent-name";

export const AgentConnectionStatus = observer(() => {
  const t = useTranslations();
  const { onboardingWizardStore: store } = useRootStore();
  const agent = useSelectedAgentName();
  const [checking, setChecking] = useState(false);
  const connected = store.agentConnected;
  useAgentStatusPolling(store, !connected);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await store.refreshAgentStatus();
    } catch (error) {
      reportApplicationError(error);
    } finally {
      setChecking(false);
    }
  };

  const message = connected
    ? t("OnboardingWizard.connect.connected")
    : store.agentStatusFailed
      ? t("OnboardingWizard.connect.failed")
      : agent
        ? t("OnboardingWizard.connect.waiting", { agent })
        : t("OnboardingWizard.connect.waitingGeneric");

  return (
    <div
      aria-label={t("OnboardingWizard.connect.statusLabel")}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm",
        connected ? "border-success/40 bg-success/5" : "border-dashed border-border bg-muted/30",
      )}
      id="onboarding-agent-status"
      role="status"
    >
      {connected ? (
        <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "size-2.5 shrink-0 rounded-full motion-reduce:animate-none",
            store.agentStatusFailed ? "bg-destructive" : "animate-pulse bg-warning",
          )}
        />
      )}

      <span className="min-w-0 flex-1 text-muted-foreground">{message}</span>

      {connected ? null : (
        <Button disabled={checking} size="sm" type="button" variant="ghost" onClick={() => void checkAgain()}>
          {checking ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" /> : null}

          {t("OnboardingWizard.connect.checkAgain")}
        </Button>
      )}
    </div>
  );
});
