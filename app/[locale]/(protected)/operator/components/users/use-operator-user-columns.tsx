"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OperatorUserRowDto } from "@/ee/operator/operator-lists.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { adProviderDisplayName, isAdProvider } from "@/features/acquisition/ad-provider-registry";
import { AppChip } from "@/components/chip/app-chip";
import { OperatorTagsCell } from "../tags/operator-tags-cell";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { SUBSCRIPTION_STATUS_COLOR_MAP } from "@/app/[locale]/(protected)/company/components/subscription/subscription-panel";

function displayName(user: OperatorUserRowDto): string {
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export function useOperatorUserColumns(): ColumnDef<OperatorUserRowDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();

  return useMemo<ColumnDef<OperatorUserRowDto>[]>(
    () => [
      {
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => <span className="text-sm font-medium">{displayName(row.original)}</span>,
      },
      {
        id: "email",
        header: t("Common.table.columns.email"),
        cell: ({ row }) => <span className="text-sm">{row.original.email}</span>,
      },
      {
        id: "workspace",
        header: t("Common.table.columns.workspace"),
        cell: ({ row }) => <span className="text-sm">{row.original.workspaceLabel}</span>,
      },
      {
        id: "tags",
        header: t("Common.table.columns.tags"),
        cell: ({ row }) => <OperatorTagsCell tags={row.original.workspaceTags} />,
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) => (
          <AppChip size="sm" variant={USER_STATUS_COLORS_MAP[row.original.status]}>
            {t(`Common.userStatuses.${row.original.status}`)}
          </AppChip>
        ),
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
        id: "operator",
        header: t("Common.table.columns.operator"),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.isPlatformOperator ? t("OperatorUsers.values.operator") : "-"}</span>
        ),
      },
      {
        accessorKey: "lastActiveAt",
        id: "lastActiveAt",
        header: t("Common.table.columns.lastActiveAt"),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.lastActiveAt
              ? intlStore.formatNumericalShortDateTime(row.original.lastActiveAt)
              : t("Common.never")}
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
      {
        accessorKey: "adProvider",
        id: "adProvider",
        header: t("Common.table.columns.adProvider"),
        cell: ({ row }) => {
          const provider = row.original.adProvider;
          if (!provider || !isAdProvider(provider)) return <span className="text-sm">-</span>;

          return (
            <span className="flex max-w-40 flex-col">
              <span className="truncate text-sm">{adProviderDisplayName(provider)}</span>

              <span className="text-[11px] uppercase text-muted-foreground">{row.original.adIdentifierKind}</span>
            </span>
          );
        },
      },
      {
        id: "credits",
        header: t("Common.table.columns.credits"),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.creditsBlockedReason === "enterprise_allowance_missing"
              ? t("OperatorUsers.credits.allowanceMissingShort")
              : row.original.creditsLimit === null
                ? t("OperatorUsers.credits.noneShort")
                : t("OperatorUsers.credits.position", {
                    remaining: intlStore.formatNumber(row.original.creditsRemaining ?? 0),
                    limit: intlStore.formatNumber(row.original.creditsLimit),
                  })}
          </span>
        ),
      },
    ],
    [intlStore, t],
  );
}
