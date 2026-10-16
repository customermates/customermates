"use client";

import type { OperatorBillingUsageDto } from "@/ee/operator/billing-usage.schema";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { InfoRow } from "@/components/shared/info-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { billingUsageMonthsBetween, lastFullBillingUsageMonth } from "@/ee/operator/billing-usage";

import { getOperatorBillingUsageAction } from "../../workspaces/actions";

import { OperatorUsageCoverageNote } from "./operator-usage-coverage-note";
import { OperatorUsageMonthSelect } from "./operator-usage-month-select";

type Props = { companyId: string; createdAt: Date };

function defaultMonth(months: readonly string[]): string {
  const lastFull = lastFullBillingUsageMonth(new Date());
  return months.includes(lastFull) ? lastFull : (months[0] ?? lastFull);
}

export function OperatorWorkspaceUsageSection({ companyId, createdAt }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const months = useMemo(() => billingUsageMonthsBetween(createdAt, new Date()), [createdAt]);
  const [month, setMonth] = useState(() => defaultMonth(months));
  const [usage, setUsage] = useState<OperatorBillingUsageDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setUsage(null);

    void getOperatorBillingUsageAction({ month, companyId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setUsage(result.data);
        else toastZodErrorTree(result.error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, month]);

  const workspace = usage?.workspaces[0] ?? null;
  const dateTime = (value: Date) => intlStore.formatNumericalShortDateTime(value, { timeZone: "UTC" });
  const estimated = (value: Date, exact: boolean) =>
    exact ? dateTime(value) : t("OperatorUsage.estimated", { date: dateTime(value) });

  return (
    <div data-operator-workspace-usage className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-x-sm font-medium">{t("OperatorUsage.title")}</h3>

          <p className="text-xs text-muted-foreground">{t("OperatorUsage.description")}</p>
        </div>

        <OperatorUsageMonthSelect id="operator-usage-month" months={months} value={month} onValueChange={setMonth} />
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : null}

      {usage && workspace ? (
        <>
          {!usage.monthComplete ? (
            <p className="text-xs text-muted-foreground">{t("OperatorUsage.monthInProgress")}</p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <InfoRow label={t("OperatorUsage.columns.seats")}>{intlStore.formatNumber(workspace.seats.count)}</InfoRow>

            <InfoRow label={t("OperatorUsage.columns.peakChannels")}>
              {workspace.channels.peakAt
                ? t("OperatorUsage.channels.peak", {
                    count: intlStore.formatNumber(workspace.channels.peak),
                    date: dateTime(workspace.channels.peakAt),
                  })
                : intlStore.formatNumber(0)}
            </InfoRow>

            <InfoRow label={t("OperatorUsage.columns.currentSeats")}>
              {intlStore.formatNumber(workspace.current.activeSeats)}
            </InfoRow>

            <InfoRow label={t("OperatorUsage.columns.currentChannels")}>
              {intlStore.formatNumber(workspace.current.connectedChannels)}
            </InfoRow>

            {workspace.deletedAt ? (
              <InfoRow label={t("OperatorUsage.columns.workspace")}>
                {t("OperatorUsage.deleted", { date: dateTime(workspace.deletedAt) })}
              </InfoRow>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium">{t("OperatorUsage.seats.title")}</h4>

            <OperatorUsageCoverageNote coverage={workspace.seats.coverage} kind="seats" monthStart={usage.from} />

            {workspace.seats.users?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("OperatorUsage.columns.name")}</TableHead>

                    <TableHead>{t("OperatorUsage.columns.role")}</TableHead>

                    <TableHead>{t("OperatorUsage.columns.added")}</TableHead>

                    <TableHead>{t("OperatorUsage.columns.deactivated")}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {workspace.seats.users.map((user) => (
                    <TableRow key={user.userId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{[user.firstName, user.lastName].filter(Boolean).join(" ") || "-"}</span>

                          <span className="text-xs text-muted-foreground">{user.email ?? "-"}</span>
                        </div>
                      </TableCell>

                      <TableCell>{user.roleName ?? "-"}</TableCell>

                      <TableCell>{estimated(user.addedAt, user.addedAtExact)}</TableCell>

                      <TableCell>
                        {user.deactivatedAt
                          ? estimated(user.deactivatedAt, user.deactivatedAtExact)
                          : t("OperatorUsage.stillActive")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-xs text-muted-foreground">{t("OperatorUsage.seats.none")}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium">{t("OperatorUsage.channels.title")}</h4>

            <OperatorUsageCoverageNote coverage={workspace.channels.coverage} kind="channels" monthStart={usage.from} />

            {workspace.channels.items?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("OperatorUsage.columns.channel")}</TableHead>

                    <TableHead>{t("OperatorUsage.columns.connected")}</TableHead>

                    <TableHead>{t("OperatorUsage.columns.disconnected")}</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {workspace.channels.items.map((channel) => (
                    <TableRow key={`${channel.accountId}-${channel.connectedAt.toISOString()}`}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{channel.provider ? t(`Common.providers.${channel.provider}`) : "-"}</span>

                          <span className="text-xs text-muted-foreground">{channel.identifier ?? "-"}</span>
                        </div>
                      </TableCell>

                      <TableCell>{estimated(channel.connectedAt, channel.connectedAtExact)}</TableCell>

                      <TableCell>
                        {channel.disconnectedAt
                          ? estimated(channel.disconnectedAt, channel.disconnectedAtExact)
                          : t("OperatorUsage.stillConnected")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-xs text-muted-foreground">{t("OperatorUsage.channels.none")}</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
