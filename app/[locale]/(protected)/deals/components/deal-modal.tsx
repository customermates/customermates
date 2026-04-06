"use client";

import { observer } from "mobx-react-lite";

import { EntityType } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { createOrganizationByNameAction, getOrganizationsAction } from "../../organizations/actions";
import { getUsersAction } from "../../company/actions";
import { createContactByNameAction, getContactsAction } from "../../contacts/actions";

import { DealServicesSelection } from "./deal-services-selection";

import { XBaseCustomColumnEntityModal } from "@/components/x-modal/x-base-custom-column-entity-modal";
import { XInput } from "@/components/x-inputs/x-input";
import { XAutocompleteItem } from "@/components/x-inputs/x-autocomplete/x-autocomplete-item";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChip } from "@/components/x-chip/x-chip";
import { XAutocompleteAvatar } from "@/components/x-inputs/x-autocomplete/x-autocomplete-avatar";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XCustomFieldValueInput } from "@/components/x-data-view/x-custom-column/x-custom-field-input";

export const DealModal = observer(() => {
  const { dealModalStore, userStore } = useRootStore();
  const { isEditingCustomField, customColumns, fetchedEntity } = dealModalStore;

  return (
    <XBaseCustomColumnEntityModal entityType={EntityType.deal} store={dealModalStore} titleKey="DealModal.title">
      <XInput autoFocus isRequired id="name" />

      {userStore.canAccess(Resource.contacts) && (
        <XAutocompleteAvatar
          getItems={getContactsAction}
          id="contactIds"
          items={fetchedEntity?.contacts ?? []}
          selectionMode="multiple"
          onCreate={(name) => createContactByNameAction(name, userStore.user?.id)}
        />
      )}

      {userStore.canAccess(Resource.organizations) && (
        <XAutocomplete
          getItems={getOrganizationsAction}
          id="organizationIds"
          items={fetchedEntity?.organizations ?? []}
          renderValue={(items) => items.map((item) => <XChip key={item.key}>{item.data?.name}</XChip>)}
          selectionMode="multiple"
          onCreate={(name) => createOrganizationByNameAction(name, userStore.user?.id)}
        >
          {(org) => XAutocompleteItem({ key: org.id, children: org.name })}
        </XAutocomplete>
      )}

      {customColumns.map((column, index) => (
        <XCustomFieldValueInput key={column.id} column={column} index={index} isEditing={isEditingCustomField} />
      ))}

      <XAutocompleteAvatar
        getItems={getUsersAction}
        id="userIds"
        items={fetchedEntity?.users ?? []}
        selectionMode="multiple"
      />

      <DealServicesSelection />
    </XBaseCustomColumnEntityModal>
  );
});
