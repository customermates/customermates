"use client";

import { observer } from "mobx-react-lite";
import { EntityType } from "@/generated/prisma";

import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  layout?: "drawer" | "page";
};

export const OrganizationDetailView = observer(({ layout = "drawer" }: Props) => {
  const { organizationDetailStore } = useRootStore();
  const { isEditingCustomField, customColumns, fetchedEntity } = organizationDetailStore;

  return (
    <EntityDetailBody
      entityType={EntityType.organization}
      layout={layout}
      store={organizationDetailStore}
      titleKey="OrganizationModal.title"
    >
      <FormInput autoFocus required id="name" />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="organization"
        items={fetchedEntity?.contacts}
        target="contact"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="organization"
        items={fetchedEntity?.deals}
        target="deal"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="organization"
        items={fetchedEntity?.tasks}
        target="task"
      />

      <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

      <AssignedUsersField items={fetchedEntity?.users} />
    </EntityDetailBody>
  );
});
