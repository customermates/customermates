"use client";

import type { TaskDto } from "@/features/tasks/task.schema";
import type { GetResult } from "@/core/base/base-get.interactor";

import { observer } from "mobx-react-lite";
import React, { useEffect } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { TaskType } from "@/generated/prisma";

import { getSystemTaskNameTranslationKey } from "./system-task.config";

import { XIcon } from "@/components/x-icon";
import { XCustomFieldValue } from "@/components/x-data-view/x-custom-column/x-custom-field-value";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XAvatarStack } from "@/components/x-avatar-stack";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";
import { XTooltip } from "@/components/x-tooltip";

type Props = {
  tasks: GetResult<TaskDto>;
};

export const TasksCardComponent = observer(({ tasks }: Props) => {
  const t = useTranslations("");

  const { tasksStore, taskModalStore, intlStore, userModalStore } = useRootStore();

  useEffect(() => tasksStore.setItems(tasks), [tasks]);

  useEffect(() => {
    const cleanupUrlSync = tasksStore.withUrlSync();
    return () => cleanupUrlSync();
  }, []);

  function renderCell(item: TaskDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name": {
        const isSystemTask = item.type !== TaskType.custom;
        const nameTranslationKey = getSystemTaskNameTranslationKey(item.type);
        const displayName = nameTranslationKey ? t(nameTranslationKey) : item.name;

        return (
          <XDataViewCell className="text-x-sm flex items-center gap-2">
            {isSystemTask && (
              <XTooltip content={t("TasksCard.systemTaskTooltip")}>
                <XIcon className="text-warning" icon={InformationCircleIcon} size="lg" />
              </XTooltip>
            )}

            <span className="truncate">{displayName}</span>
          </XDataViewCell>
        );
      }

      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;

      case "updatedAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.updatedAt)}</XDataViewCell>;

      case "users":
        return (
          <XAvatarStack items={item.users || []} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
        );

      default:
        const customColumn = tasksStore.customColumns.find((column) => column.id === columnKey);

        if (customColumn) return <XCustomFieldValue column={customColumn} item={item} store={tasksStore} />;

        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={tasksStore}
      title={t("TasksCard.title")}
      onAdd={() => void taskModalStore.add()}
      onRowAction={(item) => void taskModalStore.loadById(item.id)}
    />
  );
});
