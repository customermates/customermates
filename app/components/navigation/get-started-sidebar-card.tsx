"use client";

import type { ReactNode } from "react";

import { Check, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Action, Resource } from "@/generated/prisma";

import { AgentStartPill } from "@/components/agent-start/agent-start-pill";
import { Button } from "@/components/ui/button";
import { agentStartUrl } from "@/core/agent-start/agent-start-guide";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { billingHref, settingsHref } from "./settings-routes";

const DISMISS_KEY_PREFIX = "customermates:get-started-dismissed:";

const noSubscription = () => () => undefined;

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    return;
  }
}

function StepMark({ done }: { done: boolean }) {
  return (
    <span aria-hidden className="get-started-mark" data-done={done ? "" : undefined}>
      {done ? <Check className="size-3" /> : null}
    </span>
  );
}

function StepLink({
  done,
  href,
  trailing,
  children,
  onNavigate,
}: {
  done: boolean;
  href: string;
  trailing?: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <IntlLink className={cn("get-started-step", done && "get-started-step-done")} href={href} onClick={onNavigate}>
      <StepMark done={done} />

      <span className="min-w-0 flex-1 truncate">{children}</span>

      {trailing}
    </IntlLink>
  );
}

type Props = {
  workspaceKey: string;
  trialDaysLeft: number | null;
  canOpenBilling: boolean;
  onNavigate?: () => void;
};

export const GetStartedSidebarCard = observer(({ workspaceKey, trialDaysLeft, canOpenBilling, onNavigate }: Props) => {
  const t = useTranslations();
  const { connectedAppsStore: apps, connectedAccountsStore: accounts, userStore } = useRootStore();
  const origin = useSyncExternalStore(
    noSubscription,
    () => window.location?.origin ?? null,
    () => null,
  );
  const dismissKey = `${DISMISS_KEY_PREFIX}${workspaceKey}`;
  const [dismissed, setDismissed] = useState(true);
  const canConnectAgent = apps.canManage;
  const canConnectInbox = userStore.can(Resource.inboxMessages, Action.create);

  useEffect(() => {
    setDismissed(readDismissed(dismissKey));
  }, [dismissKey]);

  useEffect(() => {
    if (dismissed) return;
    if (canConnectAgent && !apps.isReady) void apps.refresh().catch(reportApplicationError);
    if (canConnectInbox && !accounts.isReady) void accounts.refresh().catch(reportApplicationError);
  }, [accounts, apps, canConnectAgent, canConnectInbox, dismissed]);

  const agentLoaded = !canConnectAgent || apps.dataRequest.status === "ready";
  const inboxLoaded = !canConnectInbox || accounts.dataRequest.status === "ready";
  const agentDone = canConnectAgent && apps.items.length > 0;
  const inboxDone = canConnectInbox && accounts.items.length > 0;
  const showPlan = trialDaysLeft !== null && canOpenBilling;
  const setupSteps = [canConnectAgent, canConnectInbox].filter(Boolean).length;
  const setupDone = [agentDone, inboxDone].filter(Boolean).length;

  if (dismissed || origin === null || !agentLoaded || !inboxLoaded) return null;
  if (setupSteps === 0 || setupDone === setupSteps) return null;

  const total = setupSteps + (showPlan ? 1 : 0);

  return (
    <section
      aria-labelledby="get-started-title"
      className="relative flex flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-xs group-data-[collapsible=icon]:hidden"
      data-get-started-card=""
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium" id="get-started-title">
          {t("AgentStart.getStarted")}
        </h2>

        <span className="ml-auto text-[11px] text-muted-foreground">
          {t("AgentStart.progress", { done: setupDone, total })}
        </span>

        <Button
          aria-label={t("AgentStart.sidebarDismiss")}
          className="-mr-1 size-6"
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => {
            rememberDismissed(dismissKey);
            setDismissed(true);
          }}
        >
          <X aria-hidden />
        </Button>
      </div>

      {canConnectAgent ? (
        agentDone ? (
          <StepLink done href={settingsHref("connections")} onNavigate={onNavigate}>
            {t("AgentStart.label")}
          </StepLink>
        ) : (
          <AgentStartPill
            className="get-started-pill"
            labels={{
              copied: t("AgentStart.copiedTip"),
              failed: t("AgentStart.failed"),
              label: t("AgentStart.label"),
            }}
            leading={<StepMark done={false} />}
            prompt={t("AgentStart.prompt", { url: agentStartUrl(origin) })}
            size="sm"
          />
        )
      ) : null}

      {canConnectInbox ? (
        <StepLink done={inboxDone} href={settingsHref("connections")} onNavigate={onNavigate}>
          {t("AgentStart.stepInbox")}
        </StepLink>
      ) : null}

      {showPlan ? (
        <StepLink
          done={false}
          href={billingHref()}
          trailing={
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {t("AgentStart.daysLeft", { count: trialDaysLeft })}
            </span>
          }
          onNavigate={onNavigate}
        >
          {t("AgentStart.stepPlan")}
        </StepLink>
      ) : null}
    </section>
  );
});
