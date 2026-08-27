"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityDetailCustomFieldsSection } from "@/components/entity-detail/entity-detail-custom-fields-section";
import { EntityDetailSection, EntityDetailSectionGroup } from "@/components/entity-detail/entity-detail-section";
import { EntityDetailStaticField } from "@/components/entity-detail/entity-detail-static-field";
import { EntityDetailPinButton } from "@/components/entity-detail/entity-detail-pin-button";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { ContactChannels } from "./contact-channels";
import { CONTACT_DETAIL_FIELD, CONTACT_DETAIL_SECTION } from "./contact-detail-personalization";

type Props = {
  layout?: "drawer" | "page";
};

export const ContactDetailView = observer(({ layout = "drawer" }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { contactDetailStore } = useRootStore();
  const { canManage, isEditingCustomField, customColumns, fetchedEntity } = contactDetailStore;

  const content =
    layout === "drawer" ? (
      <>
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <FormInput autoFocus required id="firstName" />

          <FormInput id="lastName" />
        </div>

        <ContactChannels contactId={fetchedEntity?.id} />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="contact"
          items={fetchedEntity?.organizations}
          target="organization"
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="contact"
          items={fetchedEntity?.deals}
          target="deal"
        />

        <EntityRelationField
          currentEntityId={fetchedEntity?.id}
          currentEntityType="contact"
          items={fetchedEntity?.tasks}
          target="task"
        />

        <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

        <AssignedUsersField items={fetchedEntity?.users} />
      </>
    ) : (
      <EntityDetailSectionGroup>
        <EntityDetailSection label={t("EntityDetail.sections.base")} sectionId={CONTACT_DETAIL_SECTION.base}>
          <FormInput
            autoFocus
            required
            id="firstName"
            labelEndAddon={
              <EntityDetailPinButton fieldId={CONTACT_DETAIL_FIELD.firstName} label={t("Common.inputs.firstName")} />
            }
          />

          <FormInput
            id="lastName"
            labelEndAddon={
              <EntityDetailPinButton fieldId={CONTACT_DETAIL_FIELD.lastName} label={t("Common.inputs.lastName")} />
            }
          />

          <ContactChannels
            contactId={fetchedEntity?.id}
            headingEndAddon={
              <EntityDetailPinButton fieldId={CONTACT_DETAIL_FIELD.identifiers} label={t("EntityChannels.heading")} />
            }
          />

          <AssignedUsersField
            items={fetchedEntity?.users}
            personalization={{ fieldId: CONTACT_DETAIL_FIELD.userIds }}
          />

          <EntityDetailStaticField
            fieldId={CONTACT_DETAIL_FIELD.createdAt}
            label={t("EntityDetail.fields.createdAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.createdAt)}
          />

          <EntityDetailStaticField
            fieldId={CONTACT_DETAIL_FIELD.updatedAt}
            label={t("EntityDetail.fields.updatedAt")}
            value={intlStore.formatNumericalShortDateTime(fetchedEntity?.updatedAt)}
          />
        </EntityDetailSection>

        <EntityDetailSection label={t("EntityDetail.sections.relations")} sectionId={CONTACT_DETAIL_SECTION.relations}>
          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="contact"
            items={fetchedEntity?.organizations}
            personalization={{ fieldId: CONTACT_DETAIL_FIELD.organizationIds }}
            target="organization"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="contact"
            items={fetchedEntity?.deals}
            personalization={{ fieldId: CONTACT_DETAIL_FIELD.dealIds }}
            target="deal"
          />

          <EntityRelationField
            currentEntityId={fetchedEntity?.id}
            currentEntityType="contact"
            items={fetchedEntity?.tasks}
            personalization={{ fieldId: CONTACT_DETAIL_FIELD.taskIds }}
            target="task"
          />
        </EntityDetailSection>

        <EntityDetailCustomFieldsSection
          canManage={canManage}
          columns={customColumns}
          entityType={EntityType.contact}
          isEditing={isEditingCustomField}
          sectionId={CONTACT_DETAIL_SECTION.customFields}
        />
      </EntityDetailSectionGroup>
    );

  return (
    <EntityDetailBody
      entityType={EntityType.contact}
      layout={layout}
      store={contactDetailStore}
      titleKey="ContactModal.title"
    >
      {content}
    </EntityDetailBody>
  );
});
