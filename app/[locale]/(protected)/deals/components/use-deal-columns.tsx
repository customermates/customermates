"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { DealDto } from "@/features/deals/deal.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { standardTailColumns } from "@/components/data-view/standard-columns";
import { useEntityHref, useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { AvatarStack } from "@/components/shared/avatar-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getSystemTaskNameTranslationKey } from "../../tasks/components/system-task.config";

export function useDealColumns(): ColumnDef<DealDto>[] {
  const { companyStore, dealsStore, intlStore, userModalStore } = useRootStore();
  const forecastsByStage = Boolean(companyStore.company?.dealWeightingColumnId);
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();
  const t = useTranslations();

  return useMemo<ColumnDef<DealDto>[]>(
    () => [
      { id: "name", cell: ({ row }) => <span className="truncate text-sm">{row.original.name ?? ""}</span> },
      {
        id: "totalValue",
        cell: ({ row }) => <span className="text-sm">{intlStore.formatCurrency(row.original.totalValue)}</span>,
      },
      ...(forecastsByStage
        ? [
            {
              id: "weightedValue",
              cell: ({ row }: { row: { original: DealDto } }) =>
                row.original.weightedValue === null ? (
                  <span />
                ) : (
                  <span className="text-sm">{intlStore.formatCurrency(row.original.weightedValue)}</span>
                ),
            },
          ]
        : []),
      {
        id: "totalQuantity",
        cell: ({ row }) => <span className="text-sm">{intlStore.formatNumber(row.original.totalQuantity)}</span>,
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
        id: "organizations",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(organization) => entityHref(EntityType.organization, organization.id)}
            items={row.original.organizations.map((organization) => ({
              id: organization.id,
              label: organization.name,
            }))}
            size="sm"
          />
        ),
      },
      {
        id: "services",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(service) => entityHref(EntityType.service, service.id)}
            items={row.original.services.map((service) => ({
              id: service.id,
              label: `${service.name} · ${intlStore.formatCurrency(service.amount * service.quantity)}`,
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
              return { id: task.id, label: nameKey && task.type !== TaskType.custom ? t(nameKey) : task.name };
            })}
            size="sm"
          />
        ),
      },
      ...standardTailColumns({ store: dealsStore, intlStore, userModalStore }),
    ],
    [dealsStore, dealsStore.customColumns, entityHref, forecastsByStage, intlStore, openEntity, t, userModalStore],
  );
}
