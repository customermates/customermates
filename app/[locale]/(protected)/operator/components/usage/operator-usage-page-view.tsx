"use client";

import type { OperatorBillingUsageDto } from "@/ee/operator/billing-usage.schema";

import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { Download, Receipt } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { usePathname, useRouter } from "@/i18n/navigation";
import { billingUsageMonthsBetween } from "@/ee/operator/billing-usage";
import { billingUsageSummaryCsv } from "@/ee/operator/billing-usage-csv";

import { OperatorUsageMonthSelect } from "./operator-usage-month-select";

const SELECTABLE_MONTHS = 36;

type Props = { usage: OperatorBillingUsageDto };

function csvHref(content: string): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
}

export function OperatorUsagePageView({ usage }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const months = useMemo(() => {
    const now = new Date();
    return billingUsageMonthsBetween(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (SELECTABLE_MONTHS - 1), 1)),
      now,
    );
  }, []);
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

  const selectMonth = (month: string) =>
    startTransition(() => router.replace(`${pathname}?month=${encodeURIComponent(month)}`));

  return (
    <AppCard data-operator-usage-page aria-busy={isPending}>
      <AppCardHeader className="gap-3">
        <IconContainer className="shrink-0" icon={Receipt} size="sm" />

        <h2 className="text-x-sm grow truncate text-muted-foreground">{t("OperatorUsage.title")}</h2>
      </AppCardHeader>

      <AppCardBody className="gap-3">
        <p className="text-xs text-muted-foreground">{t("OperatorUsage.description")}</p>

        <div className="flex flex-wrap items-center gap-2">
          <OperatorUsageMonthSelect
            id="operator-usage-page-month"
            months={months}
            value={usage.month}
            onValueChange={selectMonth}
          />

          <Button asChild variant="secondary">
            <a download={`billing-usage-${usage.month}.csv`} href={csvHref(csv)}>
              <Download aria-hidden="true" className="size-4" />

              {t("OperatorUsage.export")}
            </a>
          </Button>
        </div>

        {!usage.monthComplete ? (
          <p className="text-xs text-muted-foreground">{t("OperatorUsage.monthInProgress")}</p>
        ) : null}

        {usage.workspaces.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("OperatorUsage.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("OperatorUsage.columns.workspace")}</TableHead>

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
                      <span>{workspace.workspaceLabel}</span>

                      {workspace.deletedAt ? (
                        <span className="text-xs text-muted-foreground">
                          {t("OperatorUsage.deleted", { date: dateTime(workspace.deletedAt) })}
                        </span>
                      ) : null}
                    </div>
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
