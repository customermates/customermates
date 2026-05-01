"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EntityType, Resource } from "@/generated/prisma";

import { getUsersAction } from "../../company/actions";
import { createContactByNameAction, getContactsAction } from "../../contacts/actions";
import { createOrganizationByNameAction, getOrganizationsAction } from "../../organizations/actions";
import { createDealByNameAction, getDealsAction } from "../../deals/actions";
import { createServiceByNameAction, getServicesAction } from "../../services/actions";

import { EntityDetailBody } from "@/components/modal/entity-detail-body";
import { OpenRelationLink } from "@/components/modal/open-relation-link";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormInput } from "@/components/forms/form-input";
import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";
import { AppChip } from "@/components/chip/app-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useEntityHref } from "@/components/modal/hooks/use-entity-drawer-stack";
import { Alert } from "@/components/shared/alert";
import { AppLink } from "@/components/shared/app-link";

type Props = {
  layout?: "drawer" | "page";
};

export const TaskDetailView = observer(function TaskDetailView({ layout = "drawer" }: Props) {
  const t = useTranslations("");
  const { taskDetailStore, userModalStore, userStore } = useRootStore();
  const entityHref = useEntityHref();
  const { form, fetchedEntity, customColumns, isEditingCustomField, isCustomTask, isDisabled, systemTaskAlertConfig } =
    taskDetailStore;

  return (
    <EntityDetailBody entityType={EntityType.task} layout={layout} store={taskDetailStore} titleKey="TaskModal.title">
      {systemTaskAlertConfig && (
        <Alert color="warning">
          <p className="text-x-sm">
            {t.rich(systemTaskAlertConfig.translationKey, {
              link: (chunks) => (
                <AppLink inheritSize className="text-current" href={systemTaskAlertConfig.linkHref}>
                  {chunks}
                </AppLink>
              ),
            })}
          </p>
        </Alert>
      )}

      <FormInput required disabled={isDisabled || (!isCustomTask && form.id !== undefined)} id="name" />

      {userStore.canAccess(Resource.contacts) && (
        <FormAutocompleteAvatar
          chipHref={(id) => entityHref(EntityType.contact, id)}
          getItems={getContactsAction}
          id="contactIds"
          items={fetchedEntity?.contacts ?? []}
          labelEndAddon={
            <OpenRelationLink currentEntityId={fetchedEntity?.id} currentEntityType="task" targetEntityType="contact" />
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
              currentEntityType="task"
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

      {userStore.canAccess(Resource.deals) && (
        <FormAutocomplete
          chipHref={(id) => entityHref(EntityType.deal, id)}
          getItems={getDealsAction}
          id="dealIds"
          items={fetchedEntity?.deals ?? []}
          labelEndAddon={
            <OpenRelationLink currentEntityId={fetchedEntity?.id} currentEntityType="task" targetEntityType="deal" />
          }
          renderValue={(items) => items.map((item) => <AppChip key={item.key}>{item.data?.name}</AppChip>)}
          selectionMode="multiple"
          onCreate={(name) => createDealByNameAction(name, userStore.user?.id)}
        >
          {(deal) => FormAutocompleteItem({ children: deal.name })}
        </FormAutocomplete>
      )}

      {userStore.canAccess(Resource.services) && (
        <FormAutocomplete
          chipHref={(id) => entityHref(EntityType.service, id)}
          getItems={getServicesAction}
          id="serviceIds"
          items={fetchedEntity?.services ?? []}
          labelEndAddon={
            <OpenRelationLink currentEntityId={fetchedEntity?.id} currentEntityType="task" targetEntityType="service" />
          }
          renderValue={(items) => items.map((item) => <AppChip key={item.key}>{item.data?.name}</AppChip>)}
          selectionMode="multiple"
          onCreate={(name) => createServiceByNameAction(name, userStore.user?.id)}
        >
          {(service) => FormAutocompleteItem({ children: service.name })}
        </FormAutocomplete>
      )}

      {customColumns.map((column, index) => (
        <CustomFieldValueInput key={column.id} column={column} index={index} isEditing={isEditingCustomField} />
      ))}

      {userStore.canAccess(Resource.users) && (
        <FormAutocompleteAvatar
          getItems={getUsersAction}
          id="userIds"
          items={fetchedEntity?.users ?? []}
          selectionMode="multiple"
          onChipClick={(id) => void userModalStore.loadById(id)}
        />
      )}
    </EntityDetailBody>
  );
});
