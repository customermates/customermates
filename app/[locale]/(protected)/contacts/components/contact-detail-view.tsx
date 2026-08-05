"use client";

import { observer } from "mobx-react-lite";
import { EntityType } from "@/generated/prisma";

import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";

import { ContactChannels } from "./contact-channels";

type Props = {
  layout?: "drawer" | "page";
};

export const ContactDetailView = observer(({ layout = "drawer" }: Props) => {
  const { contactDetailStore } = useRootStore();
  const { isEditingCustomField, customColumns, fetchedEntity } = contactDetailStore;

  return (
    <EntityDetailBody
      entityType={EntityType.contact}
      layout={layout}
      store={contactDetailStore}
      titleKey="ContactModal.title"
    >
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
    </EntityDetailBody>
  );
});
