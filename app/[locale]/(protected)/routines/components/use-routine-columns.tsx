"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { RoutineDto } from "@/ee/routines/routine.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export function useRoutineColumns(): ColumnDef<RoutineDto>[] {
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();

  return useMemo<ColumnDef<RoutineDto>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => <span className="truncate text-sm font-medium">{row.original.name}</span>,
      },
      {
        id: "trigger",
        header: t("Common.table.columns.trigger"),
        cell: ({ row }) => (
          <span className="truncate text-sm">
            {row.original.triggerKind === "schedule"
              ? (row.original.cronExpression ?? t("RoutineTriggerKind.schedule"))
              : t("RoutineTriggerKind.event")}
          </span>
        ),
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) =>
          row.original.enabled ? (
            <AppChip size="sm" variant="success">
              {t("RoutineModal.enabled")}
            </AppChip>
          ) : (
            <AppChip size="sm" variant="secondary">
              {t("RoutineModal.disabled")}
            </AppChip>
          ),
      },
      {
        id: "lastRun",
        header: t("Common.table.columns.lastRun"),
        cell: ({ row }) =>
          row.original.lastRunStatus ? (
            <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[row.original.lastRunStatus]}>
              {t(`RoutineRunStatus.${row.original.lastRunStatus}`)}
            </AppChip>
          ) : (
            <span className="text-subdued text-sm">{t("RoutineDetail.never")}</span>
          ),
      },
      {
        accessorKey: "nextRunAt",
        id: "nextRunAt",
        header: t("Common.table.columns.nextRunAt"),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.nextRunAt ? intlStore.formatNumericalShortDateTime(row.original.nextRunAt) : "—"}
          </span>
        ),
      },
    ],
    [intlStore, t],
  );
}
