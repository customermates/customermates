"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { DealDto } from "@/features/deals/deal.schema";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { EntityType, TaskType } from "@/generated/prisma";

import { AvatarStack } from "@/components/shared/avatar-stack";
import { AppChipStack } from "@/components/chip/app-chip-stack";
import { DataViewContainer, standardTailColumns, useDataViewSync } from "@/components/data-view";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";

type Props = {
  deals: GetResult<DealDto>;
};

export const DealsCard = observer(({ deals }: Props) => {
  const { dealsStore, intlStore, organizationsStore, contactsStore, servicesStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const t = useTranslations("");

  useDataViewSync(dealsStore, deals, [organizationsStore, contactsStore, servicesStore]);

  const columns = useMemo<ColumnDef<DealDto>[]>(() => {
    return [
      {
        id: "name",
        cell: ({ row }) => <span className="text-sm truncate">{row.original.name ?? ""}</span>,
      },
      {
        id: "totalValue",
        cell: ({ row }) => <span className="text-sm">{intlStore.formatCurrency(row.original.totalValue)}</span>,
      },
      {
        id: "totalQuantity",
        cell: ({ row }) => <span className="text-sm">{intlStore.formatNumber(row.original.totalQuantity)}</span>,
      },
      {
        id: "contacts",
        cell: ({ row }) => (
          <AvatarStack
            items={row.original.contacts || []}
            onAvatarClick={(contact) => openEntity(EntityType.contact, contact.id)}
          />
        ),
      },
      {
        id: "organizations",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.organizations.map((org) => ({ id: org.id, label: org.name }))}
            size="sm"
            onChipClick={(org) => openEntity(EntityType.organization, org.id)}
          />
        ),
      },
      {
        id: "services",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.services.map((service) => ({
              id: service.id,
              label: `${service.name} – ${intlStore.formatCurrency(service.amount * service.quantity)}`,
            }))}
            size="sm"
            onChipClick={(service) => openEntity(EntityType.service, service.id)}
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
      ...standardTailColumns({ store: dealsStore, intlStore, userModalStore }),
    ];
  }, [dealsStore, dealsStore.customColumns, intlStore, openEntity, userModalStore, t]);

  return (
    <DataViewContainer
      columns={columns}
      store={dealsStore}
      onAdd={() => openEntity(EntityType.deal, "new")}
      onRowClick={(item) => openEntity(EntityType.deal, item.id)}
    />
  );
});
