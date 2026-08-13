"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ServiceDto } from "@/features/services/service.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { standardTailColumns } from "@/components/data-view/standard-columns";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";

export function useServiceColumns(): ColumnDef<ServiceDto>[] {
  const { intlStore, servicesStore, userModalStore } = useRootStore();
  const entityHref = useEntityHref();
  const t = useTranslations();

  return useMemo<ColumnDef<ServiceDto>[]>(
    () => [
      { id: "name", cell: ({ row }) => <span className="truncate text-sm">{row.original.name}</span> },
      {
        id: "amount",
        cell: ({ row }) => <span className="text-sm">{intlStore.formatCurrency(row.original.amount)}</span>,
      },
      {
        id: "deals",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(deal) => entityHref(EntityType.deal, deal.id)}
            items={row.original.deals.map((deal) => ({ id: deal.id, label: deal.name }))}
            size="sm"
          />
        ),
      },
      {
        id: "tasks",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(task) => entityHref(EntityType.task, task.id)}
            items={row.original.tasks.map((task) => {
              const nameKey = getSystemTaskNameTranslationKey(task.type);
              return { id: task.id, label: nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name };
            })}
            size="sm"
          />
        ),
      },
      ...standardTailColumns({ store: servicesStore, intlStore, userModalStore }),
    ],
    [entityHref, intlStore, servicesStore, servicesStore.customColumns, t, userModalStore],
  );
}
