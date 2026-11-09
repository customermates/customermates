"use client";

import type { PlanUsageDto } from "@/ee/subscription/get-plan-usage.interactor";

import { UserRoundX } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";
import { useRecordFileSize } from "@/components/records/record-file-meta";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { PlanUsageBar } from "./plan-usage-bar";
import { StorageUpsellNote } from "./storage-upsell-note";

type Props = {
  usage: PlanUsageDto;
};

export function PlanUsageCard({ usage }: Props) {
  const t = useTranslations();
  const sizeLabel = useRecordFileSize();
  const intlStore = useHydratedIntlStore();
  const { limits } = usage;
  if (!limits) return null;
  const number = (value: number) => intlStore.formatNumber(value);
  const plan = FREE_PLAN_UPGRADE_PLAN;
  const of = (used: number, limit: number) => t("PlanUsage.of", { used: number(used), limit: number(limit) });

  return (
    <section
      aria-labelledby="settings-billing-plan-usage-title"
      className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-4"
      id="settings-billing-plan-usage"
    >
      <span className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold" id="settings-billing-plan-usage-title">
          {t("PlanUsage.title")}
        </h2>

        <span className="text-xs text-muted-foreground">{t("PlanUsage.description")}</span>
      </span>

      <PlanUsageBar
        id="members"
        label={t("PlanUsage.members")}
        limit={limits.maxMembers}
        used={usage.usage.members}
        value={of(usage.usage.members, limits.maxMembers)}
        warnApproaching={false}
      />

      <PlanUsageBar
        warnApproaching
        id="records"
        label={t("PlanUsage.records")}
        limit={limits.maxRecords}
        used={usage.usage.records}
        value={of(usage.usage.records, limits.maxRecords)}
      />

      <div className="flex flex-col gap-1.5">
        <PlanUsageBar
          warnApproaching
          id="storage"
          label={t("PlanUsage.storage")}
          limit={limits.fileStorageBytes}
          used={usage.usage.storageBytes}
          value={t("PlanUsage.of", {
            used: sizeLabel(usage.usage.storageBytes),
            limit: sizeLabel(limits.fileStorageBytes),
          })}
        />

        {usage.usage.storageBytes >= limits.fileStorageBytes ? (
          <p className="text-xs text-muted-foreground">
            <StorageUpsellNote plan={usage.plan} />
          </p>
        ) : null}
      </div>

      <PlanUsageBar
        warnApproaching
        id="api"
        label={t("PlanUsage.apiToday")}
        limit={limits.apiRequestsPerDay}
        used={usage.usage.apiRequestsToday}
        value={of(usage.usage.apiRequestsToday, limits.apiRequestsPerDay)}
      />

      <span className="-mt-2 text-xs text-muted-foreground">
        {t("PlanUsage.apiPerMinute", { perMinute: number(limits.apiRequestsPerMinute) })}
      </span>

      {usage.usage.pausedMembers > 0 ? (
        <Alert
          data-plan-usage="paused"
          description={t("PlanUsage.pausedHelp", { plan: t(`Subscription.planNames.${plan}`) })}
          icon={<UserRoundX />}
          role="note"
          title={t("PlanUsage.paused", { count: usage.usage.pausedMembers })}
          variant="info"
        />
      ) : null}
    </section>
  );
}
