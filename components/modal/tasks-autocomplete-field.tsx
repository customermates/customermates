"use client";

import type { ReactNode } from "react";
import type { TaskReferenceSchema } from "@/core/base/base-entity.schema";
import type { Data } from "@/core/validation/validation.utils";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, TaskType } from "@/generated/prisma";

import { createTaskByNameAction, getTasksAction } from "@/app/[locale]/(protected)/tasks/actions";
import { getSystemTaskNameTranslationKey } from "@/app/[locale]/(protected)/tasks/components/system-task.config";

import { AppChip } from "@/components/chip/app-chip";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { OpenRelationLink } from "@/components/modal/open-relation-link";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";

type RelatedEntityType = "contact" | "organization" | "deal" | "service";

type TaskReference = Data<typeof TaskReferenceSchema>;

type Props = {
  entityType: RelatedEntityType;
  entityId: string | undefined;
  tasks: TaskReference[];
};

export const TasksAutocompleteField = observer(function TasksAutocompleteField({ entityType, entityId, tasks }: Props) {
  const { userStore } = useRootStore();
  const openEntity = useOpenEntity();
  const t = useTranslations("");

  const renderItemLabel = (data: TaskReference | undefined): ReactNode => {
    if (!data) return "";
    const nameKey = getSystemTaskNameTranslationKey(data.type);
    return nameKey && data.type !== TaskType.custom ? t(nameKey) : data.name;
  };

  return (
    <FormAutocomplete
      getItems={getTasksAction}
      id="taskIds"
      items={tasks}
      labelEndAddon={
        <OpenRelationLink currentEntityId={entityId} currentEntityType={entityType} targetEntityType="task" />
      }
      renderValue={(items) => items.map((item) => <AppChip key={item.key}>{renderItemLabel(item.data)}</AppChip>)}
      selectionMode="multiple"
      onChipClick={(id) => openEntity(EntityType.task, id)}
      onCreate={(name) => createTaskByNameAction(name, userStore.user?.id)}
    >
      {(task) => {
        const label = renderItemLabel(task);
        return FormAutocompleteItem({
          children: label,
          textValue: typeof label === "string" ? label : task.name,
        });
      }}
    </FormAutocomplete>
  );
});
