"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OperatorWorkspaceRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OperatorTagsCell } from "../tags/operator-tags-cell";
import { SUBSCRIPTION_STATUS_COLOR_MAP } from "@/app/[locale]/(protected)/company/components/subscription/subscription-panel";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function useOperatorWorkspaceColumns(): ColumnDef<OperatorWorkspaceRowDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();

  return useMemo<ColumnDef<OperatorWorkspaceRowDto>[]>(
    () => [
      {
        id: "workspace",
        header: t("Common.table.columns.workspace"),
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.workspaceLabel}</span>,
      },
      {
        id: "owner",
        header: t("Common.table.columns.owner"),
        cell: ({ row }) => <span className="text-sm">{row.original.ownerEmail ?? "-"}</span>,
      },
      {
        id: "plan",
        header: t("Common.table.columns.plan"),
        cell: ({ row }) =>
          row.original.plan ? (
            <AppChip size="sm" variant="secondary">
              {t(`Subscription.planNames.${row.original.plan}`)}
            </AppChip>
          ) : (
            <span className="text-sm text-muted-foreground">{t("OperatorUsers.values.noSubscription")}</span>
          ),
      },
      {
        id: "subscription",
        header: t("Common.table.columns.subscription"),
        cell: ({ row }) =>
          row.original.subscriptionStatus ? (
            <AppChip size="sm" variant={SUBSCRIPTION_STATUS_COLOR_MAP[row.original.subscriptionStatus]}>
              {t(`Subscription.status.${row.original.subscriptionStatus}`)}
            </AppChip>
          ) : (
            <span className="text-sm text-muted-foreground">{t("OperatorUsers.values.noSubscription")}</span>
          ),
      },
      {
        id: "tags",
        header: t("Common.table.columns.tags"),
        cell: ({ row }) => <OperatorTagsCell tags={row.original.tags} />,
      },
      {
        id: "members",
        header: t("Common.table.columns.members"),
        cell: ({ row }) => (
          <span className="text-sm">
            {t("OperatorWorkspaces.values.members", {
              active: row.original.activeUserCount,
              total: row.original.userCount,
            })}
          </span>
        ),
      },
      {
        id: "allowance",
        header: t("Common.table.columns.allowance"),
        cell: ({ row }) => {
          const { plan, subscriptionStatus, creditsPerUser } = row.original;
          if (!plan) return <span className="text-sm text-muted-foreground">-</span>;

          const awaitingContract = plan === SubscriptionPlan.enterprise && creditsPerUser === null;
          const onTrial = subscriptionStatus === SubscriptionStatus.trial;
          const label = awaitingContract
            ? t("OperatorWorkspaces.allowance.notSet")
            : creditsPerUser === null
              ? "-"
              : intlStore.formatNumber(creditsPerUser);
          const explanation = awaitingContract
            ? t("OperatorWorkspaces.allowance.hintMissing")
            : creditsPerUser === null
              ? t("OperatorWorkspaces.allowance.hintUnavailable")
              : onTrial
                ? t("OperatorWorkspaces.allowance.hintTrial")
                : plan === SubscriptionPlan.enterprise
                  ? t("OperatorWorkspaces.allowance.hintContract")
                  : t("OperatorWorkspaces.allowance.hintPlan", {
                      plan: t(`Subscription.planNames.${row.original.plan}`),
                    });

          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={awaitingContract ? "text-sm text-warning" : "text-sm"}>{label}</span>
              </TooltipTrigger>

              <TooltipContent className="max-w-72">{explanation}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "trialEnd",
        header: t("Common.table.columns.trialEnd"),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.trialEndDate
              ? intlStore.formatNumericalShortDate(row.original.trialEndDate)
              : t("OperatorWorkspaces.terms.noTrial")}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [intlStore, t],
  );
}
