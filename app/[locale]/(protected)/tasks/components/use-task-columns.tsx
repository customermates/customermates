"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { TaskDto } from "@/features/tasks/task.schema";

import { Info } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { AppChipStack } from "@/components/chip/app-chip-stack";
import { standardTailColumns } from "@/components/data-view/standard-columns";
import { useEntityHref } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { Icon } from "@/components/shared/icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { getSystemTaskNameTranslationKey } from "./system-task.config";

export function useTaskColumns(): ColumnDef<TaskDto>[] {
  const { tasksStore, userModalStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const entityHref = useEntityHref();
  const { singular } = useEntityTerminology();
  const taskLabel = singular(EntityType.task);
  const t = useTranslations();

  return useMemo<ColumnDef<TaskDto>[]>(
    () => [
      {
        id: "name",
        cell: ({ row }) => {
          const item = row.original;
          const nameKey = getSystemTaskNameTranslationKey(item.type);
          const displayName = nameKey ? t(nameKey) : item.name;
          return (
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="min-w-0 truncate">{displayName}</span>

              {item.type !== TaskType.custom && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Icon className="ml-auto shrink-0 text-warning" icon={Info} size="lg" />
                    </TooltipTrigger>

                    <TooltipContent>{t("TasksCard.systemTaskTooltip", { task: taskLabel })}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        },
      },
      {
        id: "contacts",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(contact) => entityHref(EntityType.contact, contact.id)}
            items={row.original.contacts.map((contact) => ({
              id: contact.id,
              label: `${contact.firstName} ${contact.lastName}`.trim(),
            }))}
            size="sm"
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
        id: "services",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(service) => entityHref(EntityType.service, service.id)}
            items={row.original.services.map((service) => ({
              id: service.id,
              label: service.name,
            }))}
            size="sm"
          />
        ),
      },
      ...standardTailColumns({ store: tasksStore, intlStore, userModalStore }),
    ],
    [entityHref, intlStore, taskLabel, tasksStore, tasksStore.customColumns, t, userModalStore],
  );
}
