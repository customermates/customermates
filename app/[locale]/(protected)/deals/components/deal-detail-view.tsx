"use client";

import { observer } from "mobx-react-lite";
import { EntityType } from "@/generated/prisma";

import { DealServicesSelection } from "./deal-services-selection";

import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  layout?: "drawer" | "page";
};

export const DealDetailView = observer(({ layout = "drawer" }: Props) => {
  const { dealDetailStore } = useRootStore();
  const { isEditingCustomField, customColumns, fetchedEntity } = dealDetailStore;

  return (
    <EntityDetailBody entityType={EntityType.deal} layout={layout} store={dealDetailStore} titleKey="DealModal.title">
      <FormInput autoFocus required id="name" />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="deal"
        items={fetchedEntity?.contacts}
        target="contact"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="deal"
        items={fetchedEntity?.organizations}
        target="organization"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="deal"
        items={fetchedEntity?.tasks}
        target="task"
      />

      <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

      <AssignedUsersField items={fetchedEntity?.users} />

      <DealServicesSelection />
    </EntityDetailBody>
  );
});
