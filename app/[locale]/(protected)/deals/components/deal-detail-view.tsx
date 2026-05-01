"use client";

import { observer } from "mobx-react-lite";
import { EntityType, Resource } from "@/generated/prisma";

import { createOrganizationByNameAction, getOrganizationsAction } from "../../organizations/actions";
import { getUsersAction } from "../../company/actions";
import { createContactByNameAction, getContactsAction } from "../../contacts/actions";

import { DealServicesSelection } from "./deal-services-selection";

import { EntityDetailBody } from "@/components/modal/entity-detail-body";
import { OpenRelationLink } from "@/components/modal/open-relation-link";
import { TasksAutocompleteField } from "@/components/modal/tasks-autocomplete-field";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityHref } from "@/components/modal/hooks/use-entity-drawer-stack";
import { AppChip } from "@/components/chip/app-chip";
import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";

type Props = {
  layout?: "drawer" | "page";
};

export const DealDetailView = observer(function DealDetailView({ layout = "drawer" }: Props) {
  const { dealDetailStore, userModalStore, userStore } = useRootStore();
  const entityHref = useEntityHref();
  const { isEditingCustomField, customColumns, fetchedEntity } = dealDetailStore;

  return (
    <EntityDetailBody entityType={EntityType.deal} layout={layout} store={dealDetailStore} titleKey="DealModal.title">
      <FormInput autoFocus required id="name" />

      {userStore.canAccess(Resource.contacts) && (
        <FormAutocompleteAvatar
          chipHref={(id) => entityHref(EntityType.contact, id)}
          getItems={getContactsAction}
          id="contactIds"
          items={fetchedEntity?.contacts ?? []}
          labelEndAddon={
            <OpenRelationLink currentEntityId={fetchedEntity?.id} currentEntityType="deal" targetEntityType="contact" />
          }
          selectionMode="multiple"
          onCreate={(name) => createContactByNameAction(name, userStore.user?.id)}
        />
      )}

      {userStore.canAccess(Resource.organizations) && (
        <FormAutocomplete
          chipHref={(id) => entityHref(EntityType.organization, id)}
          getItems={getOrganizationsAction}
          id="organizationIds"
          items={fetchedEntity?.organizations ?? []}
          labelEndAddon={
            <OpenRelationLink
              currentEntityId={fetchedEntity?.id}
              currentEntityType="deal"
              targetEntityType="organization"
            />
          }
          renderValue={(items) => items.map((item) => <AppChip key={item.key}>{item.data?.name}</AppChip>)}
          selectionMode="multiple"
          onCreate={(name) => createOrganizationByNameAction(name, userStore.user?.id)}
        >
          {(org) => FormAutocompleteItem({ children: org.name })}
        </FormAutocomplete>
      )}

      {userStore.canAccess(Resource.tasks) && (
        <TasksAutocompleteField entityId={fetchedEntity?.id} entityType="deal" tasks={fetchedEntity?.tasks ?? []} />
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

      <DealServicesSelection />
    </EntityDetailBody>
  );
});
