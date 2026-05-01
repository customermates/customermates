"use client";

import type { TaskDto } from "@/features/tasks/task.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useMemo } from "react";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { getSystemTaskNameTranslationKey } from "./system-task.config";

import { Icon } from "@/components/shared/icon";
import { useRootStore } from "@/core/stores/root-store.provider";
import { DataViewContainer, standardTailColumns, useDataViewSync } from "@/components/data-view";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEntityHref, useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { AppChipStack } from "@/components/chip/app-chip-stack";

type Props = {
  tasks: GetResult<TaskDto>;
};

export const TasksCardComponent = observer(({ tasks }: Props) => {
  const t = useTranslations("");

  const { tasksStore, intlStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const entityHref = useEntityHref();

  useDataViewSync(tasksStore, tasks);

  const columns = useMemo<ColumnDef<TaskDto>[]>(() => {
    return [
      {
        id: "name",
        cell: ({ row }) => {
          const item = row.original;
          const isSystemTask = item.type !== TaskType.custom;
          const nameTranslationKey = getSystemTaskNameTranslationKey(item.type);
          const displayName = nameTranslationKey ? t(nameTranslationKey) : item.name;

          return (
            <div className="text-sm flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{displayName}</span>

              {isSystemTask && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Icon className="shrink-0 text-warning ml-auto" icon={Info} size="lg" />
                    </TooltipTrigger>

                    <TooltipContent>{t("TasksCard.systemTaskTooltip")}</TooltipContent>
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
            chipHref={(c) => entityHref(EntityType.contact, c.id)}
            items={row.original.contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))}
            size="sm"
          />
        ),
      },
      {
        id: "organizations",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(o) => entityHref(EntityType.organization, o.id)}
            items={row.original.organizations.map((o) => ({ id: o.id, label: o.name }))}
            size="sm"
          />
        ),
      },
      {
        id: "deals",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(d) => entityHref(EntityType.deal, d.id)}
            items={row.original.deals.map((d) => ({ id: d.id, label: d.name }))}
            size="sm"
          />
        ),
      },
      {
        id: "services",
        cell: ({ row }) => (
          <AppChipStack
            chipHref={(s) => entityHref(EntityType.service, s.id)}
            items={row.original.services.map((s) => ({ id: s.id, label: s.name }))}
            size="sm"
          />
        ),
      },
      ...standardTailColumns({ store: tasksStore, intlStore, userModalStore }),
    ];
  }, [t, tasksStore.customColumns, intlStore, userModalStore, openEntity, entityHref]);

  return (
    <DataViewContainer
      columns={columns}
      rowHref={(item) => entityHref(EntityType.task, item.id)}
      store={tasksStore}
      onAdd={() => openEntity(EntityType.task, "new")}
    />
  );
});
