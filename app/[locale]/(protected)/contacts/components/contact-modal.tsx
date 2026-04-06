"use client";

import { observer } from "mobx-react-lite";

import { EntityType, Resource } from "@/generated/prisma";

import { createDealByNameAction, getDealsAction } from "../../deals/actions";
import { createOrganizationByNameAction, getOrganizationsAction } from "../../organizations/actions";
import { getUsersAction } from "../../company/actions";

import { XBaseCustomColumnEntityModal } from "@/components/x-modal/x-base-custom-column-entity-modal";
import { XChip } from "@/components/x-chip/x-chip";
import { XCustomFieldValueInput } from "@/components/x-data-view/x-custom-column/x-custom-field-input";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XAutocompleteAvatar } from "@/components/x-inputs/x-autocomplete/x-autocomplete-avatar";
import { XAutocompleteItem } from "@/components/x-inputs/x-autocomplete/x-autocomplete-item";
import { XInput } from "@/components/x-inputs/x-input";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ContactModal = observer(() => {
  const { contactModalStore, userStore } = useRootStore();

  const { isEditingCustomField, customColumns, fetchedEntity } = contactModalStore;

  return (
    <XBaseCustomColumnEntityModal
      entityType={EntityType.contact}
      store={contactModalStore}
      titleKey="ContactModal.title"
    >
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <XInput autoFocus isRequired id="firstName" />

        <XInput id="lastName" />
      </div>

      {userStore.canAccess(Resource.organizations) && (
        <XAutocomplete
          getItems={getOrganizationsAction}
          id="organizationIds"
          items={fetchedEntity?.organizations ?? []}
          renderValue={(items) => items.map((item) => <XChip key={item.key}>{item.data?.name}</XChip>)}
          selectionMode="multiple"
          onCreate={(name) => createOrganizationByNameAction(name, userStore.user?.id)}
        >
          {(item) => XAutocompleteItem({ key: item.id, children: item.name })}
        </XAutocomplete>
      )}

      {userStore.canAccess(Resource.deals) && (
        <XAutocomplete
          getItems={getDealsAction}
          id="dealIds"
          items={fetchedEntity?.deals ?? []}
          renderValue={(items) => items.map((item) => <XChip key={item.key}>{item.data?.name}</XChip>)}
          selectionMode="multiple"
          onCreate={(name) => createDealByNameAction(name, userStore.user?.id)}
        >
          {(deal) => XAutocompleteItem({ key: deal.id, children: deal.name })}
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
    </XBaseCustomColumnEntityModal>
  );
});
