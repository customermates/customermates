"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { OrganizationDto } from "@/features/organizations/organization.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { standardTailColumns } from "@/components/data-view/standard-columns";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";

export function useOrganizationColumns(): ColumnDef<OrganizationDto>[] {
  const { organizationsStore, userModalStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const t = useTranslations();

  return useMemo<ColumnDef<OrganizationDto>[]>(
    () => [
      {
        id: "name",
        cell: ({ row }) => <span className="truncate text-sm">{row.original.name ?? ""}</span>,
      },
      {
        id: "contacts",
        cell: ({ row }) => (
          <AvatarStack
            avatarHref={(contact) => entityHref(EntityType.contact, contact.id)}
            items={row.original.contacts || []}
            onAvatarClick={(contact) => openEntity(EntityType.contact, contact.id)}
          />
        ),
      },
      {
        id: "deals",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(deal) => entityHref(EntityType.deal, deal.id)}
            items={row.original.deals.map((deal) => ({
              id: deal.id,
              label: deal.name,
            }))}
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
              const label = nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name;
              return { id: task.id, label };
            })}
            size="sm"
          />
        ),
      },
      ...standardTailColumns({
        store: organizationsStore,
        intlStore,
        userModalStore,
      }),
    ],
    [entityHref, intlStore, openEntity, organizationsStore, organizationsStore.customColumns, t, userModalStore],
  );
}
