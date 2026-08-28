"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailField } from "@/components/entity-detail/entity-detail-field";
import { EntityDetailFieldActions } from "@/components/entity-detail/entity-detail-field-actions";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { FormInput } from "@/components/forms/form-input";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { ORGANIZATION_DETAIL_FIELD, ORGANIZATION_DETAIL_SECTION } from "./organization-detail-personalization";

type Props = {
  layout?: "drawer" | "page";
};

export const OrganizationDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const { plural } = useEntityTerminology();
  const intlStore = useHydratedIntlStore();
  const { organizationDetailStore } = useRootStore();
  const { canManage, isEditingCustomField, customColumns, fetchedEntity } = organizationDetailStore;

  const content =
    layout === "drawer" ? (
      <>
        <EntityDetailField fieldId={ORGANIZATION_DETAIL_FIELD.name}>
          <FormInput autoFocus required id="name" />
        </EntityDetailField>

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="organization"
          items={fetchedEntity?.contacts}
          target="contact"
          visibilityFieldId={ORGANIZATION_DETAIL_FIELD.contactIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="organization"
          items={fetchedEntity?.deals}
          target="deal"
          visibilityFieldId={ORGANIZATION_DETAIL_FIELD.dealIds}
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="organization"
          items={fetchedEntity?.tasks}
          target="task"
          visibilityFieldId={ORGANIZATION_DETAIL_FIELD.taskIds}
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

        <AssignedUsersField items={fetchedEntity?.users} visibilityFieldId={ORGANIZATION_DETAIL_FIELD.userIds} />
      </>
    ) : (
      <EntityDetailSectionGroup>
        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={ORGANIZATION_DETAIL_SECTION.base}>
          <EntityDetailField fieldId={ORGANIZATION_DETAIL_FIELD.name}>
            <FormInput
              autoFocus
              required
              id="name"
              labelEndAddon={
                <EntityDetailFieldActions fieldId={ORGANIZATION_DETAIL_FIELD.name} label={t("Common.inputs.name")} />
              }
            />
          </EntityDetailField>

          <AssignedUsersField
            items={fetchedEntity?.users}
            personalization={{
              fieldId: ORGANIZATION_DETAIL_FIELD.userIds,
              label: t("Common.inputs.userIds"),
            }}
          />

          <EntityDetailStaticField
            fieldId={ORGANIZATION_DETAIL_FIELD.createdAt}
            label={t("EntityDetail.fields.createdAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
          />

          <EntityDetailStaticField
            fieldId={ORGANIZATION_DETAIL_FIELD.updatedAt}
            label={t("EntityDetail.fields.updatedAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
          />
        </EntityDetailSection>

        <EntityDetailSection
          label={t("EntityDetail.sections.relations")}
          sectionId={ORGANIZATION_DETAIL_SECTION.relations}
        >
          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="organization"
            items={fetchedEntity?.contacts}
            personalization={{
              fieldId: ORGANIZATION_DETAIL_FIELD.contactIds,
              label: plural(EntityType.contact),
            }}
            target="contact"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="organization"
            items={fetchedEntity?.deals}
            personalization={{
              fieldId: ORGANIZATION_DETAIL_FIELD.dealIds,
              label: plural(EntityType.deal),
            }}
            target="deal"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="organization"
            items={fetchedEntity?.tasks}
            personalization={{
              fieldId: ORGANIZATION_DETAIL_FIELD.taskIds,
              label: plural(EntityType.task),
            }}
            target="task"
          />
        </EntityDetailSection>

        <EntityDetailCustomFieldsSection
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.organization}
          isEditing={isEditingCustomField}
          sectionId={ORGANIZATION_DETAIL_SECTION.customFields}
        />
      </EntityDetailSectionGroup>
    );

  return (
    <EntityDetailBody
      entityType={EntityType.organization}
      layout={layout}
      store={organizationDetailStore}
      titleKey="OrganizationModal.title"
    >
      {content}
    </EntityDetailBody>
  );
});
