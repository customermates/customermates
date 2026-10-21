"use client";

import type { OperatorBillingUsageDto } from "@/ee/operator/billing-usage.schema";

import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { Download, Receipt } from "lucide-react";

import { SubscriptionStatus } from "@/generated/prisma";

import { SUBSCRIPTION_STATUS_COLOR_MAP } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/subscription-panel";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { usePathname, useRouter } from "@/i18n/navigation";
import { billingUsageSummaryCsv } from "@/ee/operator/billing-usage-csv";

import { operatorCsvHref } from "../operator-csv-href";

import { OperatorUsageMonthSelect } from "./operator-usage-month-select";

type Props = { months: readonly string[]; usage: OperatorBillingUsageDto };

export function OperatorUsagePageView({ months, usage }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const csv = useMemo(() => billingUsageSummaryCsv(usage), [usage]);
  const dateTime = (value: Date) => intlStore.formatNumericalShortDateTime(value, { timeZone: "UTC" });
  const incomplete = (complete: boolean) =>
    complete ? null : (
      <span className="text-warning">
        <span aria-hidden="true"> *</span>

        <span className="sr-only">{t("OperatorUsage.coverage.incomplete")}</span>
      </span>
    );
  const hasIncomplete = usage.workspaces.some(
    (workspace) => !workspace.seats.coverage.complete || !workspace.channels.coverage.complete,
  );

  const payingBy = (billing: "lemonSqueezy" | "manual") =>
    usage.subscriptions.groups
      .filter((group) => group.billing === billing && group.status === SubscriptionStatus.active)
      .reduce((sum, group) => sum + group.workspaces, 0);

  const selectMonth = (month: string) =>
    startTransition(() => router.replace(`${pathname}?month=${encodeURIComponent(month)}`, { scroll: false }));

  return (
    <AppCard data-operator-usage-page>
      <AppCardHeader className="gap-3">
        <IconContainer className="shrink-0" icon={Receipt} size="sm" />

        <h2 className="text-x-sm grow truncate text-muted-foreground">{t("OperatorUsage.title")}</h2>
      </AppCardHeader>

      <AppCardBody className="gap-3">
        <p className="text-xs text-muted-foreground">{t("OperatorUsage.description")}</p>

        <div aria-busy={isPending} aria-live="polite" className="flex flex-wrap items-center gap-2">
          <OperatorUsageMonthSelect
            id="operator-usage-page-month"
            months={months}
            value={usage.month}
            onValueChange={selectMonth}
          />

          <Button asChild variant="secondary">
            <a download={`billing-usage-${usage.month}.csv`} href={operatorCsvHref(csv)}>
              <Download aria-hidden="true" className="size-4" />

              {t("OperatorUsage.export")}
            </a>
          </Button>
        </div>

        {!usage.monthComplete ? (
          <p className="text-xs text-muted-foreground">{t("OperatorUsage.monthInProgress")}</p>
        ) : null}

        {usage.recordingStartedAt && usage.from < usage.recordingStartedAt ? (
          <p className="text-xs text-warning">
            {t("OperatorUsage.deletedBeforeRecording", { date: dateTime(usage.recordingStartedAt) })}
          </p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("OperatorUsage.subscriptions.summary", {
            paying: usage.subscriptions.paying,
            total: usage.subscriptions.workspaces,
            lemonSqueezy: payingBy("lemonSqueezy"),
            manual: payingBy("manual"),
          })}
        </p>

        {usage.workspaces.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("OperatorUsage.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Common.table.columns.workspace")}</TableHead>

                <TableHead>{t("Common.table.columns.plan")}</TableHead>

                <TableHead>{t("Common.table.columns.subscription")}</TableHead>

                <TableHead className="text-right">{t("OperatorUsage.columns.seats")}</TableHead>

                <TableHead className="text-right">{t("OperatorUsage.columns.peakChannels")}</TableHead>

                <TableHead>{t("OperatorUsage.columns.peakAt")}</TableHead>

                <TableHead className="text-right">{t("OperatorUsage.columns.currentSeats")}</TableHead>

                <TableHead className="text-right">{t("OperatorUsage.columns.currentChannels")}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {usage.workspaces.map((workspace) => (
                <TableRow key={workspace.companyId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="block max-w-48 break-all whitespace-normal sm:max-w-80">
                        {workspace.workspaceLabel}
                      </span>

                      {workspace.deletedAt ? (
                        <span className="text-xs text-muted-foreground">
                          {t("OperatorUsage.deleted", { date: dateTime(workspace.deletedAt) })}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell>
                    {workspace.subscription ? (
                      <div className="flex flex-col items-start gap-1">
                        <AppChip size="sm" variant="secondary">
                          {t(`Subscription.planNames.${workspace.subscription.plan}`)}
                        </AppChip>

                        <span className="text-xs text-muted-foreground">
                          {t(`OperatorUsage.billing.${workspace.subscription.billing}`)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{t("OperatorUsers.values.noSubscription")}</span>
                    )}
                  </TableCell>

                  <TableCell>
                    {workspace.subscription ? (
                      <AppChip size="sm" variant={SUBSCRIPTION_STATUS_COLOR_MAP[workspace.subscription.status]}>
                        {t(`Subscription.status.${workspace.subscription.status}`)}
                      </AppChip>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(workspace.seats.count)}

                    {incomplete(workspace.seats.coverage.complete)}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(workspace.channels.peak)}

                    {incomplete(workspace.channels.coverage.complete)}
                  </TableCell>

                  <TableCell>{workspace.channels.peakAt ? dateTime(workspace.channels.peakAt) : "-"}</TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(workspace.current.activeSeats)}
                  </TableCell>

                  <TableCell className="text-right tabular-nums">
                    {intlStore.formatNumber(workspace.current.connectedChannels)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {hasIncomplete ? <p className="text-xs text-warning">{t("OperatorUsage.coverage.footnote")}</p> : null}
      </AppCardBody>
    </AppCard>
  );
}
