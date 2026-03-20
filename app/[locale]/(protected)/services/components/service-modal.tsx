"use client";

import { observer } from "mobx-react-lite";

import { EntityType } from "@/generated/prisma";
import { Resource } from "@/generated/prisma";

import { createDealByNameAction, getDealsAction } from "../../deals/actions";
import { getUsersAction } from "../../company/actions";

import { XBaseCustomColumnEntityModal } from "@/components/x-modal/x-base-custom-column-entity-modal";
import { XInput } from "@/components/x-inputs/x-input";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XInputNumber } from "@/components/x-inputs/x-input-number";
import { XAutocompleteAvatar } from "@/components/x-inputs/x-autocomplete/x-autocomplete-avatar";
import { XCustomFieldValueInput } from "@/components/x-data-view/x-custom-column/x-custom-field-input";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XAutocompleteItem } from "@/components/x-inputs/x-autocomplete/x-autocomplete-item";
import { XChip } from "@/components/x-chip/x-chip";

export const ServiceModal = observer(() => {
  const { serviceModalStore, intlStore, userStore } = useRootStore();
  const { isEditingCustomField, customColumns, fetchedEntity } = serviceModalStore;

  return (
    <XBaseCustomColumnEntityModal
      entityType={EntityType.service}
      store={serviceModalStore}
      titleKey="ServiceModal.title"
    >
      <XInput autoFocus isRequired id="name" />

      <XInputNumber
        isRequired
        endContent={
          intlStore.companyCurrency && (
            <span className="mr-1.5">{intlStore.formatCurrency(0).replace(/[\d\s,.-]/g, "")}</span>
          )
        }
        id="amount"
      />

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
