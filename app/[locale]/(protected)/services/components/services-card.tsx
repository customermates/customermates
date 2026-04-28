"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { ServiceDto } from "@/features/services/service.schema";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { EntityType, TaskType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { DataViewContainer, standardTailColumns, useDataViewSync } from "@/components/data-view";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";

type Props = {
  services: GetResult<ServiceDto>;
};

export const ServicesCard = observer(({ services }: Props) => {
  const { servicesStore, dealsStore, intlStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const t = useTranslations("");

  useDataViewSync(servicesStore, services, [dealsStore]);

  const columns = useMemo<ColumnDef<ServiceDto>[]>(() => {
    return [
      {
        id: "name",
        cell: ({ row }) => <span className="text-sm truncate">{row.original.name}</span>,
      },
      {
        id: "amount",
        cell: ({ row }) => <span className="text-sm">{intlStore.formatCurrency(row.original.amount)}</span>,
      },
      {
        id: "deals",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.deals.map((deal) => ({ id: deal.id, label: deal.name }))}
            size="sm"
            onChipClick={(deal) => openEntity(EntityType.deal, deal.id)}
          />
        ),
      },
      {
        id: "tasks",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.tasks.map((task) => {
              const nameKey = getSystemTaskNameTranslationKey(task.type);
              const label = nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name;
              return { id: task.id, label };
            })}
            size="sm"
            onChipClick={(task) => openEntity(EntityType.task, task.id)}
          />
        ),
      },
      ...standardTailColumns({ store: servicesStore, intlStore, userModalStore }),
    ];
  }, [servicesStore, servicesStore.customColumns, intlStore, openEntity, userModalStore, t]);

  return (
    <DataViewContainer
      columns={columns}
      store={servicesStore}
      onAdd={() => openEntity(EntityType.service, "new")}
      onRowClick={(item) => openEntity(EntityType.service, item.id)}
    />
  );
});
