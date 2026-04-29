"use client";

import { observer } from "mobx-react-lite";
import { EntityType, Resource } from "@/generated/prisma";

import { createContactByNameAction, getContactsAction } from "../../contacts/actions";
import { getUsersAction } from "../../company/actions";
import { createDealByNameAction, getDealsAction } from "../../deals/actions";

import { EntityDetailBody } from "@/components/modal/entity-detail-body";
import { OpenRelationLink } from "@/components/modal/open-relation-link";
import { TasksAutocompleteField } from "@/components/modal/tasks-autocomplete-field";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";
import { AppChip } from "@/components/chip/app-chip";

type Props = {
  layout?: "drawer" | "page";
};

export const OrganizationDetailView = observer(function OrganizationDetailView({ layout = "drawer" }: Props) {
  const { organizationDetailStore, userModalStore, userStore } = useRootStore();
  const openEntity = useOpenEntity();
  const { isEditingCustomField, customColumns, fetchedEntity } = organizationDetailStore;

  return (
    <EntityDetailBody
      entityType={EntityType.organization}
      layout={layout}
      store={organizationDetailStore}
      titleKey="OrganizationModal.title"
    >
      <FormInput autoFocus required id="name" />

      {userStore.canAccess(Resource.contacts) && (
        <FormAutocompleteAvatar
          getItems={getContactsAction}
          id="contactIds"
          items={fetchedEntity?.contacts ?? []}
          labelEndAddon={
            <OpenRelationLink
              currentEntityId={fetchedEntity?.id}
              currentEntityType="organization"
              targetEntityType="contact"
            />
          }
          selectionMode="multiple"
          onChipClick={(id) => openEntity(EntityType.contact, id)}
          onCreate={(name) => createContactByNameAction(name, userStore.user?.id)}
        />
      )}

      {userStore.canAccess(Resource.deals) && (
        <FormAutocomplete
          getItems={getDealsAction}
          id="dealIds"
          items={fetchedEntity?.deals ?? []}
          labelEndAddon={
            <OpenRelationLink
              currentEntityId={fetchedEntity?.id}
              currentEntityType="organization"
              targetEntityType="deal"
            />
          }
          renderValue={(items) => items.map((item) => <AppChip key={item.key}>{item.data?.name}</AppChip>)}
          selectionMode="multiple"
          onChipClick={(id) => openEntity(EntityType.deal, id)}
          onCreate={(name) => createDealByNameAction(name, userStore.user?.id)}
        >
          {(deal) => FormAutocompleteItem({ children: deal.name })}
        </FormAutocomplete>
      )}

      {userStore.canAccess(Resource.tasks) && (
        <TasksAutocompleteField
          entityId={fetchedEntity?.id}
          entityType="organization"
          tasks={fetchedEntity?.tasks ?? []}
        />
      )}

      {customColumns.map((column, index) => (
        <CustomFieldValueInput key={column.id} column={column} index={index} isEditing={isEditingCustomField} />
      ))}

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
