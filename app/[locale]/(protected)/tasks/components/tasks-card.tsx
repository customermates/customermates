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
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { AppChipStack } from "@/components/chip/app-chip-stack";

type Props = {
  tasks: GetResult<TaskDto>;
};

export const TasksCardComponent = observer(({ tasks }: Props) => {
  const t = useTranslations("");

  const { tasksStore, intlStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();

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
            items={row.original.contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() }))}
            size="sm"
            onChipClick={(c) => openEntity(EntityType.contact, c.id)}
          />
        ),
      },
      {
        id: "organizations",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.organizations.map((o) => ({ id: o.id, label: o.name }))}
            size="sm"
            onChipClick={(o) => openEntity(EntityType.organization, o.id)}
          />
        ),
      },
      {
        id: "deals",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.deals.map((d) => ({ id: d.id, label: d.name }))}
            size="sm"
            onChipClick={(d) => openEntity(EntityType.deal, d.id)}
          />
        ),
      },
      {
        id: "services",
        cell: ({ row }) => (
          <AppChipStack
            items={row.original.services.map((s) => ({ id: s.id, label: s.name }))}
            size="sm"
            onChipClick={(s) => openEntity(EntityType.service, s.id)}
          />
        ),
      },
      ...standardTailColumns({ store: tasksStore, intlStore, userModalStore }),
    ];
  }, [t, tasksStore.customColumns, intlStore, userModalStore, openEntity]);

  return (
    <DataViewContainer
      columns={columns}
      store={tasksStore}
      onAdd={() => openEntity(EntityType.task, "new")}
      onRowClick={(item) => openEntity(EntityType.task, item.id)}
    />
  );
});
