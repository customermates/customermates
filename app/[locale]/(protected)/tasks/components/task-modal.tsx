"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Resource, EntityType } from "@/generated/prisma";

import { getUsersAction } from "../../company/actions";

import { XBaseCustomColumnEntityModal } from "@/components/x-modal/x-base-custom-column-entity-modal";
import { XAutocompleteAvatar } from "@/components/x-inputs/x-autocomplete/x-autocomplete-avatar";
import { XInput } from "@/components/x-inputs/x-input";
import { XCustomFieldValueInput } from "@/components/x-data-view/x-custom-column/x-custom-field-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XAlert } from "@/components/x-alert";
import { XLink } from "@/components/x-link";

export const TaskModal = observer(() => {
  const t = useTranslations("");
  const { taskModalStore, userModalStore, userStore } = useRootStore();
  const { form, fetchedEntity, customColumns, isEditingCustomField, isCustomTask, isDisabled, systemTaskAlertConfig } =
    taskModalStore;

  return (
    <XBaseCustomColumnEntityModal
      canDelete={isCustomTask}
      entityType={EntityType.task}
      store={taskModalStore}
      titleKey="TaskModal.title"
    >
      {systemTaskAlertConfig && (
        <XAlert color="warning">
          <p className="text-x-sm">
            {t.rich(systemTaskAlertConfig.translationKey, {
              link: (chunks) => (
                <XLink inheritSize color="warning" href={systemTaskAlertConfig.linkHref} underline="always">
                  {chunks}
                </XLink>
              ),
            })}
          </p>
        </XAlert>
      )}

      <XInput isRequired id="name" isDisabled={isDisabled || (!isCustomTask && form.id !== undefined)} />

      {customColumns.map((column, index) => (
        <XCustomFieldValueInput key={column.id} column={column} index={index} isEditing={isEditingCustomField} />
      ))}

      {userStore.canAccess(Resource.users) && (
        <XAutocompleteAvatar
          getItems={getUsersAction}
          id="userIds"
          items={fetchedEntity?.users ?? []}
          selectionMode="multiple"
          onChipClick={(id) => void userModalStore.loadById(id)}
        />
      )}
    </XBaseCustomColumnEntityModal>
  );
});
