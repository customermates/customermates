"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailOverview } from "@/components/entity-detail/entity-detail-overview";
import { EntityDetailFieldDragHandle } from "@/components/entity-detail/entity-detail-fields";
import { FormControlRow } from "@/components/forms/form-control-row";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { AppLink } from "@/components/shared/app-link";
import { Alert } from "@/components/shared/alert";
import { Input } from "@/components/ui/input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { TASK_DETAIL_FIELD } from "./task-detail-personalization";

type Props = {
  layout?: "drawer" | "page";
};

export const TaskDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { taskDetailStore } = useRootStore();
  const {
    canManage,
    form,
    fetchedEntity,
    customColumns,
    isEditingCustomField,
    isCustomTask,
    systemTaskAlertConfig,
    systemTaskDisplayName,
    toggleEditingCustomField,
  } = taskDetailStore;

  const systemTaskAlert = systemTaskAlertConfig && (
    <Alert color="warning">
      <p className="text-x-sm">
        {t.rich(systemTaskAlertConfig.translationKey, {
          link: (chunks) => (
            <AppLink inheritSize appearance="inline" href={systemTaskAlertConfig.linkHref}>
              {chunks}
            </AppLink>
          ),
        })}
      </p>
    </Alert>
  );

  const drawerNameField =
    !isCustomTask && form.id !== undefined ? (
      <div className="space-y-1.5">
        <FormLabel htmlFor="name">{t("Common.inputs.name")}</FormLabel>

        <Input readOnly id="name" value={systemTaskDisplayName} />
      </div>
    ) : (
      <FormInput required id="name" />
    );

  const pageNameField =
    !isCustomTask && form.id !== undefined ? (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FormLabel htmlFor="name">{t("Common.inputs.name")}</FormLabel>

          <EntityDetailFieldActions fieldId={TASK_DETAIL_FIELD.name} label={t("Common.inputs.name")} />
        </div>

        <FormControlRow startAddon={<EntityDetailFieldDragHandle label={t("Common.inputs.name")} />}>
          <Input readOnly id="name" value={systemTaskDisplayName} />
        </FormControlRow>
      </div>
    ) : (
      <FormInput
        required
        controlStartAddon={<EntityDetailFieldDragHandle label={t("Common.inputs.name")} />}
        id="name"
        labelEndAddon={<EntityDetailFieldActions fieldId={TASK_DETAIL_FIELD.name} label={t("Common.inputs.name")} />}
      />
    );

  const content =
    layout === "drawer" ? (
      <>
        {systemTaskAlert}

        <EntityDetailField fieldId={TASK_DETAIL_FIELD.name}>{drawerNameField}</EntityDetailField>

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="task"
          items={fetchedEntity?.contacts}
          target="contact"
          visibilityFieldId={TASK_DETAIL_FIELD.contactIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="task"
          items={fetchedEntity?.organizations}
          target="organization"
          visibilityFieldId={TASK_DETAIL_FIELD.organizationIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="task"
          items={fetchedEntity?.deals}
          target="deal"
          visibilityFieldId={TASK_DETAIL_FIELD.dealIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="task"
          items={fetchedEntity?.services}
          target="service"
          visibilityFieldId={TASK_DETAIL_FIELD.serviceIds}
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

        <AssignedUsersField items={fetchedEntity?.users} visibilityFieldId={TASK_DETAIL_FIELD.userIds} />
      </>
    ) : (
      <div className="flex min-w-0 flex-col gap-4">
        {systemTaskAlert}

        <EntityDetailOverview
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.task}
          fields={[
            {
              id: TASK_DETAIL_FIELD.name,
              content: <EntityDetailField fieldId={TASK_DETAIL_FIELD.name}>{pageNameField}</EntityDetailField>,
            },
            {
              id: TASK_DETAIL_FIELD.userIds,
              content: (
                <AssignedUsersField
                  items={fetchedEntity?.users}
                  personalization={{
                    fieldId: TASK_DETAIL_FIELD.userIds,
                    label: t("Common.inputs.userIds"),
                  }}
                />
              ),
            },
            {
              id: TASK_DETAIL_FIELD.contactIds,
              content: (
                <EntityRelationField
                  currentEntityId={fetchedEntity?.id}
                  currentEntityType="task"
                  items={fetchedEntity?.contacts}
                  personalization={{
                    fieldId: TASK_DETAIL_FIELD.contactIds,
                    label: plural(EntityType.contact),
                  }}
                  target="contact"
                />
              ),
            },
            {
              id: TASK_DETAIL_FIELD.organizationIds,
              content: (
                <EntityRelationField
                  currentEntityId={fetchedEntity?.id}
                  currentEntityType="task"
                  items={fetchedEntity?.organizations}
                  personalization={{
                    fieldId: TASK_DETAIL_FIELD.organizationIds,
                    label: plural(EntityType.organization),
                  }}
                  target="organization"
                />
              ),
            },
            {
              id: TASK_DETAIL_FIELD.dealIds,
              content: (
                <EntityRelationField
                  currentEntityId={fetchedEntity?.id}
                  currentEntityType="task"
                  items={fetchedEntity?.deals}
                  personalization={{
                    fieldId: TASK_DETAIL_FIELD.dealIds,
                    label: plural(EntityType.deal),
                  }}
                  target="deal"
                />
              ),
            },
            {
              id: TASK_DETAIL_FIELD.serviceIds,
              content: (
                <EntityRelationField
                  currentEntityId={fetchedEntity?.id}
                  currentEntityType="task"
                  items={fetchedEntity?.services}
                  personalization={{
                    fieldId: TASK_DETAIL_FIELD.serviceIds,
                    label: plural(EntityType.service),
                  }}
                  target="service"
                />
              ),
            },
            {
              id: TASK_DETAIL_FIELD.createdAt,
              content: (
                <EntityDetailStaticField
                  fieldId={TASK_DETAIL_FIELD.createdAt}
                  label={t("EntityDetail.fields.createdAt")}
                  value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
                />
              ),
            },
            {
              id: TASK_DETAIL_FIELD.updatedAt,
              content: (
                <EntityDetailStaticField
                  fieldId={TASK_DETAIL_FIELD.updatedAt}
                  label={t("EntityDetail.fields.updatedAt")}
                  value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
                />
              ),
            },
          ]}
          isEditing={isEditingCustomField}
          onToggleEditing={toggleEditingCustomField}
        />
      </div>
    );

  return (
    <EntityDetailBody entityType={EntityType.task} layout={layout} store={taskDetailStore} titleKey="TaskModal.title">
      {content}
    </EntityDetailBody>
  );
});
