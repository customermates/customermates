"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { Input } from "@/components/ui/input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";

type Props = {
  layout?: "drawer" | "page";
};

export const TaskDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const { taskDetailStore } = useRootStore();
  const {
    form,
    fetchedEntity,
    customColumns,
    isEditingCustomField,
    isCustomTask,
    isDisabled,
    systemTaskAlertConfig,
    systemTaskDisplayName,
  } = taskDetailStore;

  return (
    <EntityDetailBody entityType={EntityType.task} layout={layout} store={taskDetailStore} titleKey="TaskModal.title">
      {systemTaskAlertConfig && (
        <Alert color="warning">
          <p className="text-x-sm">
            {t.rich(systemTaskAlertConfig.translationKey, {
              link: (chunks) => (
                <AppLink inheritSize className="text-current" href={systemTaskAlertConfig.linkHref}>
                  {chunks}
                </AppLink>
              ),
            })}
          </p>
        </Alert>
      )}

      {!isCustomTask && form.id !== undefined ? (
        <div className="space-y-1.5">
          <FormLabel htmlFor="name">{t("Common.inputs.name")}</FormLabel>

          <Input disabled readOnly id="name" value={systemTaskDisplayName} />
        </div>
      ) : (
        <FormInput required disabled={isDisabled} id="name" />
      )}

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="task"
        items={fetchedEntity?.contacts}
        target="contact"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="task"
        items={fetchedEntity?.organizations}
        target="organization"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="task"
        items={fetchedEntity?.deals}
        target="deal"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="task"
        items={fetchedEntity?.services}
        target="service"
      />

      <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

      <AssignedUsersField items={fetchedEntity?.users} />
    </EntityDetailBody>
  );
});
