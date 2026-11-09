"use client";

import type { AppMode } from "@/core/config/environment";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";
import type { PlanUsageDto } from "@/ee/subscription/get-plan-usage.interactor";
import type { FreeLoss, PlanFitUsage } from "@/core/commercial/plan-fit";
import type { ReactNode } from "react";

import { useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CLOUD_TRIAL, FREE_PLAN_UPGRADE_PLAN, FREE_PLAN_USAGE_LIMITS } from "@/core/commercial/plan-catalog";
import { lostOnFree, planThatKeepsItRunning, TRIAL_END_WINDOW_DAYS } from "@/core/commercial/plan-fit";
import { MESSAGING_UPSELL_PLAN } from "@/app/components/upsell/plan-upsell-highlights";
import { PlanUsageBar } from "@/app/components/upsell/plan-usage-bar";
import { UpsellPlanPrice } from "@/app/components/upsell/upsell-plan-price";
import { IntlLink } from "@/i18n/navigation";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { billingHref } from "./settings-routes";

const DISMISS_EVENT = "customermates:trial-card-dismissed";
const DISMISS_KEY_PREFIX = "customermates:trial-card-dismissed:";
const FREE_DISMISS_KEY_PREFIX = "customermates:free-card-dismissed:";
const dismissedInMemory = new Set<string>();

function subscribe(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  return () => window.removeEventListener(DISMISS_EVENT, onChange);
}

function isDismissed(key: string): boolean {
  if (dismissedInMemory.has(key)) return true;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function rememberForSession(key: string) {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    return;
  }
}

function dismiss(key: string) {
  dismissedInMemory.add(key);
  rememberForSession(key);
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

export function trialCardVisible(input: {
  appMode: AppMode;
  restricted: boolean;
  subscription: Pick<SubscriptionDto, "status" | "hasActiveSubscription" | "checkout" | "onFreePlan"> | null;
  trialDaysLeft: number | null;
  onBillingPage: boolean;
  canOpenBilling: boolean;
}): boolean {
  return (
    input.appMode === "cloud" &&
    !input.restricted &&
    input.subscription?.status === "trial" &&
    !input.subscription.onFreePlan &&
    !input.subscription.hasActiveSubscription &&
    input.subscription.checkout !== "pending" &&
    input.trialDaysLeft !== null &&
    !input.onBillingPage &&
    input.canOpenBilling
  );
}

export function trialProgressPercent(daysLeft: number, trialDays: number = CLOUD_TRIAL.days): number {
  if (trialDays <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((daysLeft / trialDays) * 100)));
}

type Props = {
  daysLeft: number;
  planName: string;
  workspaceKey: string;
  onNavigate: () => void;
  fit?: PlanFitUsage | null;
};

type CardProps = {
  dismissKey: string;
  href: string;
  title: string;
  description?: string;
  ctaLabel: string;
  onNavigate: () => void;
  meterPercent?: number;
  price?: ReactNode;
  details?: ReactNode;
  dataAttribute: "data-trial-card" | "data-free-plan-card";
};

function PlanSidebarCard({
  dismissKey,
  href,
  title,
  description,
  ctaLabel,
  onNavigate,
  meterPercent,
  price,
  details,
  dataAttribute,
}: CardProps) {
  const t = useTranslations();
  const dismissed = useSyncExternalStore(
    subscribe,
    () => isDismissed(dismissKey),
    () => true,
  );

  if (dismissed) return null;

  return (
    <section
      aria-label={title}
      className="relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-xs group-data-[collapsible=icon]:hidden"
      data-plan-sidebar-card=""
      {...{ [dataAttribute]: "" }}
    >
      <span className="pr-6 text-xs leading-4 font-medium text-foreground">{title}</span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("Upsell.trial.dismiss")}
            className="absolute top-1.5 right-1.5 text-muted-foreground"
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() => dismiss(dismissKey)}
          >
            <X />
          </Button>
        </TooltipTrigger>

        <TooltipContent>{t("Upsell.trial.dismiss")}</TooltipContent>
      </Tooltip>

      {meterPercent !== undefined ? (
        <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${meterPercent}%` }} />
        </span>
      ) : null}

      {details}

      {description ? <span className="text-[11px] leading-4 text-muted-foreground">{description}</span> : null}

      {price ? <span className="text-[11px] leading-4 text-muted-foreground">{price}</span> : null}

      <Button asChild className="mt-1 w-full" size="sm" variant="ink">
        <IntlLink href={href} onClick={onNavigate}>
          {ctaLabel}
        </IntlLink>
      </Button>
    </section>
  );
}

function freeLossLabel({ kind, count }: FreeLoss, t: ReturnType<typeof useTranslations>): string {
  switch (kind) {
    case "accounts":
      return t("Upsell.trialEnd.items.accounts", { count });
    case "drafts":
      return t("Upsell.trialEnd.items.drafts", { count });
    case "routines":
      return t("Upsell.trialEnd.items.routines", { count });
    case "members":
      return t("Upsell.trialEnd.items.members", { count });
    case "webhooks":
      return t("Upsell.trialEnd.items.webhooks", { count });
    case "mate":
      return t("Upsell.trialEnd.items.mate", { count });
  }
}

export function TrialSidebarCard({ daysLeft, planName, workspaceKey, onNavigate, fit = null }: Props) {
  const t = useTranslations();
  const keepPlan = daysLeft <= TRIAL_END_WINDOW_DAYS && fit ? planThatKeepsItRunning(fit) : null;
  const losses = keepPlan && fit ? lostOnFree(fit) : [];

  if (keepPlan && losses.length > 0) {
    const keepPlanName = t(`Subscription.planNames.${keepPlan}`);

    return (
      <PlanSidebarCard
        ctaLabel={t("Upsell.trialEnd.cta", { plan: keepPlanName })}
        dataAttribute="data-trial-card"
        details={
          <div className="flex flex-col gap-1" data-trial-end-losses="">
            <span className="text-[11px] leading-4 text-muted-foreground">{t("Upsell.trialEnd.lead")}</span>

            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {losses.map((loss) => (
                <li
                  key={loss.kind}
                  className="flex items-baseline gap-1.5 text-[11px] leading-4 text-foreground"
                  data-trial-end-loss={loss.kind}
                >
                  <span aria-hidden className="mt-1.5 block size-1 shrink-0 self-start rounded-full bg-foreground/50" />

                  {freeLossLabel(loss, t)}
                </li>
              ))}
            </ul>
          </div>
        }
        dismissKey={`${DISMISS_KEY_PREFIX}${workspaceKey}${daysLeft <= 1 ? ":last-day" : ""}`}
        href={billingHref(keepPlan)}
        meterPercent={trialProgressPercent(daysLeft)}
        price={<UpsellPlanPrice plan={keepPlan} />}
        title={t("Upsell.trial.title", { days: daysLeft, plan: planName })}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <PlanSidebarCard
      ctaLabel={t("Upsell.trial.cta")}
      dataAttribute="data-trial-card"
      description={t("Upsell.trial.description")}
      dismissKey={`${DISMISS_KEY_PREFIX}${workspaceKey}`}
      href={billingHref()}
      meterPercent={trialProgressPercent(daysLeft)}
      title={t("Upsell.trial.title", { days: daysLeft, plan: planName })}
      onNavigate={onNavigate}
    />
  );
}

export function FreePlanSidebarCard({
  workspaceKey,
  onNavigate,
  usage = null,
}: Pick<Props, "workspaceKey" | "onNavigate"> & { usage?: PlanUsageDto | null }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const plan = FREE_PLAN_UPGRADE_PLAN;
  const limits = usage?.limits ?? null;
  const of = (used: number, limit: number) =>
    t("PlanUsage.of", { used: intlStore.formatNumber(used), limit: intlStore.formatNumber(limit) });

  return (
    <PlanSidebarCard
      ctaLabel={t("Upsell.upgradeTo", { plan: t(`Subscription.planNames.${plan}`) })}
      dataAttribute="data-free-plan-card"
      description={
        usage && limits
          ? t("Upsell.free.upgradeDescription", {
              inboxPlan: t(`Subscription.planNames.${MESSAGING_UPSELL_PLAN}`),
              plan: t(`Subscription.planNames.${plan}`),
            })
          : t("Upsell.free.description", {
              inboxPlan: t(`Subscription.planNames.${MESSAGING_UPSELL_PLAN}`),
              plan: t(`Subscription.planNames.${plan}`),
              members: FREE_PLAN_USAGE_LIMITS.maxMembers,
              records: intlStore.formatNumber(FREE_PLAN_USAGE_LIMITS.maxRecords),
            })
      }
      details={
        usage && limits ? (
          <div className="flex flex-col gap-2" data-free-plan-usage="">
            <PlanUsageBar
              compact
              warnApproaching
              id="records"
              label={t("PlanUsage.records")}
              limit={limits.maxRecords}
              used={usage.usage.records}
              value={of(usage.usage.records, limits.maxRecords)}
            />

            <PlanUsageBar
              compact
              id="members"
              label={t("PlanUsage.members")}
              limit={limits.maxMembers}
              used={usage.usage.members}
              value={of(usage.usage.members, limits.maxMembers)}
              warnApproaching={false}
            />

            <PlanUsageBar
              compact
              warnApproaching
              id="api"
              label={t("PlanUsage.apiToday")}
              limit={limits.apiRequestsPerDay}
              used={usage.usage.apiRequestsToday}
              value={of(usage.usage.apiRequestsToday, limits.apiRequestsPerDay)}
            />
          </div>
        ) : null
      }
      dismissKey={`${FREE_DISMISS_KEY_PREFIX}${workspaceKey}`}
      href={billingHref(plan)}
      price={<UpsellPlanPrice plan={plan} />}
      title={t("Upsell.free.title")}
      onNavigate={onNavigate}
    />
  );
}
