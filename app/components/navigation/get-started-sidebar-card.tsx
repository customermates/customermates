"use client";

import type { ReactNode } from "react";

import { ArrowRight, Check, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Action, Resource } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import { TRIAL_END_WINDOW_DAYS } from "@/core/commercial/plan-fit";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { actionData } from "@/core/utils/action-data";
import { refreshConnectedAppsAction } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/actions";
import { refreshConnectedAccountsAction } from "@/app/[locale]/(protected)/w/[workspace]/settings/(account)/channels/actions";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { billingHref, settingsHref } from "./settings-routes";

const DISMISS_KEY_PREFIX = "customermates:get-started-dismissed:";

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
    <IntlLink
      className={cn("get-started-step", done && "get-started-step-done")}
      href={href}
      prefetch={false}
      onClick={onNavigate}
    >
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
  const dismissKey = `${DISMISS_KEY_PREFIX}${workspaceKey}`;
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const canConnectAgent = apps.canManage;
  const canConnectInbox = userStore.can(Resource.inboxMessages, Action.create);

  useEffect(() => {
    setDismissed(readDismissed(dismissKey));
  }, [dismissKey]);

  const [counts, setCounts] = useState<{
    apps: number | null;
    accounts: number | null;
  }>({
    apps: null,
    accounts: null,
  });

  useEffect(() => {
    if (dismissed !== false) return;
    let current = true;
    if (canConnectAgent && !apps.isReady) {
      void actionData(refreshConnectedAppsAction())
        .then((items) => current && setCounts((previous) => ({ ...previous, apps: items.length })))
        .catch(reportApplicationError);
    }
    if (canConnectInbox && !accounts.isReady) {
      void refreshConnectedAccountsAction()
        .then((result) => {
          if (current && result.ok) {
            setCounts((previous) => ({
              ...previous,
              accounts: result.data.length,
            }));
          }
        })
        .catch(reportApplicationError);
    }
    return () => {
      current = false;
    };
  }, [accounts, apps, canConnectAgent, canConnectInbox, dismissed]);

  const appCount = apps.isReady ? apps.items.length : counts.apps;
  const accountCount = accounts.isReady ? accounts.items.length : counts.accounts;
  const agentLoaded = !canConnectAgent || appCount !== null;
  const inboxLoaded = !canConnectInbox || accountCount !== null;
  const agentDone = canConnectAgent && (appCount ?? 0) > 0;
  const inboxDone = canConnectInbox && (accountCount ?? 0) > 0;
  const showPlan = trialDaysLeft !== null && trialDaysLeft > TRIAL_END_WINDOW_DAYS && canOpenBilling;
  const setupSteps = [canConnectAgent, canConnectInbox].filter(Boolean).length;
  const setupDone = [agentDone, inboxDone].filter(Boolean).length;

  if (dismissed === null) return null;
  if (dismissed || setupSteps === 0 || (agentLoaded && inboxLoaded && setupDone === setupSteps)) {
    return showPlan ? (
      <IntlLink
        className="get-started-trial group-data-[collapsible=icon]:hidden"
        data-trial-reminder=""
        href={billingHref()}
        prefetch={false}
        onClick={onNavigate}
      >
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {t("Subscription.status.trialDaysLeft", { days: trialDaysLeft })}
        </span>

        <span className="get-started-trial-cta">
          {t("AgentStart.stepPlan")}

          <ArrowRight aria-hidden className="size-3" />
        </span>
      </IntlLink>
    ) : null;
  }
  if (!agentLoaded || !inboxLoaded) return null;

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
        <StepLink done={agentDone} href={settingsHref("connections")} onNavigate={onNavigate}>
          {t("AgentStart.stepAgent")}
        </StepLink>
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
