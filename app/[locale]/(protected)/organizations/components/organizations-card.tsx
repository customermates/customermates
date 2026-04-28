"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
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
  organizations: GetResult<OrganizationDto>;
};

export const OrganizationsCard = observer(({ organizations }: Props) => {
  const { contactsStore, organizationsStore, userModalStore, dealsStore, intlStore } = useRootStore();
  const openEntity = useOpenEntity();
  const t = useTranslations("");

  useDataViewSync(organizationsStore, organizations, [contactsStore, dealsStore]);

  const columns = useMemo<ColumnDef<OrganizationDto>[]>(() => {
    return [
      {
        id: "name",
        cell: ({ row }) => <span className="text-sm truncate">{row.original.name ?? ""}</span>,
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
      ...standardTailColumns({ store: organizationsStore, intlStore, userModalStore }),
    ];
  }, [organizationsStore, organizationsStore.customColumns, openEntity, userModalStore, intlStore, t]);

  return (
    <DataViewContainer
      columns={columns}
      store={organizationsStore}
      onAdd={() => openEntity(EntityType.organization, "new")}
      onRowClick={(item) => openEntity(EntityType.organization, item.id)}
    />
  );
});
