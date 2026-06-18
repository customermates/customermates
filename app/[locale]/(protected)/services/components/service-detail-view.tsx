"use client";

import { observer } from "mobx-react-lite";
import { EntityType } from "@/generated/prisma";

import { EntityDetailBody } from "@/components/entity-detail/entity-detail-body";
import { EntityRelationField, AssignedUsersField } from "@/components/entity-detail/relation-fields";
import { CustomFieldInputs } from "@/components/data-view/custom-columns/custom-field-inputs";
import { FormInput } from "@/components/forms/form-input";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  layout?: "drawer" | "page";
};

export const ServiceDetailView = observer(({ layout = "drawer" }: Props) => {
  const { serviceDetailStore, intlStore } = useRootStore();
  const { isEditingCustomField, customColumns, fetchedEntity } = serviceDetailStore;

  return (
    <EntityDetailBody
      entityType={EntityType.service}
      layout={layout}
      store={serviceDetailStore}
      titleKey="ServiceModal.title"
    >
      <FormInput autoFocus required id="name" />

      <FormNumberInput
        required
        endContent={
          intlStore.companyCurrency && (
            <span className="mr-1.5">{intlStore.formatCurrency(0).replace(/[\d\s,.-]/g, "")}</span>
          )
        }
        id="amount"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="service"
        items={fetchedEntity?.deals}
        target="deal"
      />

      <EntityRelationField
        currentEntityId={fetchedEntity?.id}
        currentEntityType="service"
        items={fetchedEntity?.tasks}
        target="task"
      />

      <CustomFieldInputs columns={customColumns} isEditing={isEditingCustomField} />

      <AssignedUsersField items={fetchedEntity?.users} />
    </EntityDetailBody>
  );
});
