"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailStarButton } from "@/components/entity-detail/entity-detail-star-button";
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

import { TASK_DETAIL_FIELD, TASK_DETAIL_SECTION } from "./task-detail-personalization";

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
    isDisabled,
    systemTaskAlertConfig,
    systemTaskDisplayName,
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

        <Input disabled readOnly id="name" value={systemTaskDisplayName} />
      </div>
    ) : (
      <FormInput required disabled={isDisabled} id="name" />
    );

  const pageNameField =
    !isCustomTask && form.id !== undefined ? (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <FormLabel htmlFor="name">{t("Common.inputs.name")}</FormLabel>

          <EntityDetailStarButton fieldId={TASK_DETAIL_FIELD.name} label={t("Common.inputs.name")} />
        </div>

        <Input disabled readOnly id="name" value={systemTaskDisplayName} />
      </div>
    ) : (
      <FormInput
        required
        disabled={isDisabled}
        id="name"
        labelEndAddon={<EntityDetailStarButton fieldId={TASK_DETAIL_FIELD.name} label={t("Common.inputs.name")} />}
      />
    );

  const content =
    layout === "drawer" ? (
      <>
        {systemTaskAlert}

        {drawerNameField}

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
      </>
    ) : (
      <EntityDetailSectionGroup>
        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={TASK_DETAIL_SECTION.base}>
          {systemTaskAlert}

          {pageNameField}

          <AssignedUsersField
            items={fetchedEntity?.users}
            personalization={{
              fieldId: TASK_DETAIL_FIELD.userIds,
              label: t("Common.inputs.userIds"),
            }}
          />

          <EntityDetailStaticField
            fieldId={TASK_DETAIL_FIELD.createdAt}
            label={t("EntityDetail.fields.createdAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
          />

          <EntityDetailStaticField
            fieldId={TASK_DETAIL_FIELD.updatedAt}
            label={t("EntityDetail.fields.updatedAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
          />
        </EntityDetailSection>

        <EntityDetailSection label={t("EntityDetail.sections.relations")} sectionId={TASK_DETAIL_SECTION.relations}>
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
        </EntityDetailSection>

        <EntityDetailCustomFieldsSection
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.task}
          isEditing={isEditingCustomField}
          sectionId={TASK_DETAIL_SECTION.customFields}
        />
      </EntityDetailSectionGroup>
    );

  return (
    <EntityDetailBody entityType={EntityType.task} layout={layout} store={taskDetailStore} titleKey="TaskModal.title">
      {content}
    </EntityDetailBody>
  );
});
