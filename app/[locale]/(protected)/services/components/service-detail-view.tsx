"use client";

import { observer } from "mobx-react-lite";
import { EntityType, Resource } from "@/generated/prisma";

import { createDealByNameAction, getDealsAction } from "../../deals/actions";
import { getUsersAction } from "../../company/actions";

import { EntityDetailBody } from "@/components/modal/entity-detail-body";
import { OpenRelationLink } from "@/components/modal/open-relation-link";
import { TasksAutocompleteField } from "@/components/modal/tasks-autocomplete-field";
import { FormInput } from "@/components/forms/form-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";
import { AppChip } from "@/components/chip/app-chip";

type Props = {
  layout?: "drawer" | "page";
};

export const ServiceDetailView = observer(function ServiceDetailView({ layout = "drawer" }: Props) {
  const { serviceDetailStore, userModalStore, intlStore, userStore } = useRootStore();
  const openEntity = useOpenEntity();
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

      {userStore.canAccess(Resource.deals) && (
        <FormAutocomplete
          getItems={getDealsAction}
          id="dealIds"
          items={fetchedEntity?.deals ?? []}
          labelEndAddon={
            <OpenRelationLink currentEntityId={fetchedEntity?.id} currentEntityType="service" targetEntityType="deal" />
          }
          renderValue={(items) => items.map((item) => <AppChip key={item.key}>{item.data?.name}</AppChip>)}
          selectionMode="multiple"
          onChipClick={(id) => openEntity(EntityType.deal, id)}
          onCreate={(name) => createDealByNameAction(name, userStore.user?.id)}
        >
          {(deal) => FormAutocompleteItem({ children: deal.name })}
        </FormAutocomplete>
      )}

      {customColumns.map((column, index) => (
        <CustomFieldValueInput key={column.id} column={column} index={index} isEditing={isEditingCustomField} />
      ))}

      {userStore.canAccess(Resource.tasks) && (
        <TasksAutocompleteField entityId={fetchedEntity?.id} entityType="service" tasks={fetchedEntity?.tasks ?? []} />
      )}

      <FormAutocompleteAvatar
        getItems={getUsersAction}
        id="userIds"
        items={fetchedEntity?.users ?? []}
        selectionMode="multiple"
        onChipClick={(id) => void userModalStore.loadById(id)}
      />
    </EntityDetailBody>
  );
});
