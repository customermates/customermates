"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";
import type { AutomationBuilderModel } from "./automation-builder-model";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { EmptyValue } from "@/components/shared/empty-value";
import { Avatar } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";

import { automationItemSentence } from "./automation-item-sentence";

type Options = {
  model: AutomationBuilderModel;
  pendingId: string | null;
  canToggle: (item: AutomationListItemDto) => boolean;
  onToggle: (item: AutomationListItemDto, enabled: boolean) => void;
};

export function useAutomationColumns({
  model,
  pendingId,
  canToggle,
  onToggle,
}: Options): ColumnDef<AutomationListItemDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();

  return useMemo<ColumnDef<AutomationListItemDto>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{row.original.name}</span>

            {row.original.kind === "routine" && (
              <AppChip size="sm" variant="secondary">
                {t("Automations.kind.routine")}
              </AppChip>
            )}
          </span>
        ),
      },
      {
        id: "sentence",
        header: t("Automations.columns.sentence"),
        cell: ({ row }) => (
          <span className="truncate text-sm text-muted-foreground">
            {automationItemSentence(row.original, model, t, intlStore)}
          </span>
        ),
      },
      {
        id: "runsOn",
        header: t("Automations.columns.runsOn"),
        cell: ({ row }) => (
          <AppChip size="sm" variant={row.original.runsOn === "free" ? "secondary" : "info"}>
            {t(`Automations.runsOn.${row.original.runsOn}`)}
          </AppChip>
        ),
      },
      {
        accessorKey: "lastRunAt",
        id: "lastRunAt",
        header: t("Common.table.columns.lastRunAt"),
        cell: ({ row }) => {
          const { lastRunAt, lastRunStatus } = row.original;
          if (!lastRunAt || !lastRunStatus)
            return <span className="text-subdued text-sm">{t("Automations.neverRun")}</span>;
          return (
            <span className="flex items-center gap-2">
              <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[lastRunStatus]}>
                {t(`RoutineRunStatus.${lastRunStatus}`)}
              </AppChip>

              <span className="text-xs text-muted-foreground">{intlStore.formatRelativeTime(lastRunAt)}</span>
            </span>
          );
        },
      },
      {
        accessorKey: "runs30d",
        id: "runs30d",
        header: t("Automations.columns.runs30d"),
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{t("Automations.runs30d", { count: row.original.runs30d })}</span>
        ),
      },
      {
        id: "enabled",
        header: t("Automations.columns.enabled"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span
              className="flex flex-col gap-0.5"
              role="presentation"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <span className="flex items-center gap-2">
                <Switch
                  aria-label={t("AutomationRules.active", { name: item.name })}
                  checked={item.enabled}
                  data-automation-switch={item.id}
                  disabled={pendingId === item.id || !canToggle(item)}
                  onCheckedChange={(enabled) => onToggle(item, enabled)}
                />

                <span className="text-xs text-muted-foreground">
                  {item.enabled ? t("Automations.builder.active") : t("Automations.builder.paused")}
                </span>
              </span>

              {!item.enabled && item.disabledReason === "planPaused" && (
                <span className="text-xs text-warning-soft-foreground">{t("RoutineModal.planPaused")}</span>
              )}
            </span>
          );
        },
      },
      {
        id: "owner",
        header: t("Common.table.columns.owner"),
        cell: ({ row }) => {
          const owner = row.original.owner;
          if (!owner) return <EmptyValue />;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={[owner.firstName, owner.lastName]} size="sm" src={owner.avatarUrl} />

              <span className="truncate text-sm">{`${owner.firstName} ${owner.lastName}`.trim()}</span>

              {owner.status !== "active" && (
                <AppChip size="sm" variant={USER_STATUS_COLORS_MAP[owner.status]}>
                  {t(`Common.userStatuses.${owner.status}`)}
                </AppChip>
              )}
            </div>
          );
        },
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
    [canToggle, intlStore, model, onToggle, pendingId, t],
  );
}
