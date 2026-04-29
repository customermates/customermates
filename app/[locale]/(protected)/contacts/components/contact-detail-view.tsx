"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { EntityType, Resource } from "@/generated/prisma";

import { createDealByNameAction, getDealsAction } from "../../deals/actions";
import { createOrganizationByNameAction, getOrganizationsAction } from "../../organizations/actions";
import { getUsersAction } from "../../company/actions";

import { EntityDetailBody } from "@/components/modal/entity-detail-body";
import { OpenRelationLink } from "@/components/modal/open-relation-link";
import { TasksAutocompleteField } from "@/components/modal/tasks-autocomplete-field";
import { AppChip } from "@/components/chip/app-chip";
import { CustomFieldValueInput } from "@/components/data-view/custom-columns/custom-field-value-input";
import { FormInput } from "@/components/forms/form-input";
import { FormInputChips } from "@/components/forms/form-input-chips";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { copyToClipboard } from "@/lib/clipboard";

type Props = {
  layout?: "drawer" | "page";
};

export const ContactDetailView = observer(function ContactDetailView({ layout = "drawer" }: Props) {
  const { contactDetailStore, userStore, userModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const t = useTranslations("");

  const { isEditingCustomField, customColumns, fetchedEntity } = contactDetailStore;

  async function handleCopyEmail(value: string) {
    const ok = await copyToClipboard(value);
    if (ok) toast.success(t("Common.notifications.copiedToClipboard", { value }));
    else toast.error(t("Common.notifications.copyFailed"));
  }

  return (
    <EntityDetailBody
      entityType={EntityType.contact}
      layout={layout}
      store={contactDetailStore}
      titleKey="ContactModal.title"
    >
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        <FormInput autoFocus required id="firstName" />

        <FormInput id="lastName" />
      </div>

      <FormInputChips arrayMode id="emails" onChipClick={(val) => void handleCopyEmail(val)} />

      {userStore.canAccess(Resource.organizations) && (
        <FormAutocomplete
          getItems={getOrganizationsAction}
          id="organizationIds"
          items={fetchedEntity?.organizations ?? []}
          labelEndAddon={
            <OpenRelationLink
              currentEntityId={fetchedEntity?.id}
              currentEntityType="contact"
              targetEntityType="organization"
            />
          }
          renderValue={(items) => items.map((item) => <AppChip key={item.key}>{item.data?.name}</AppChip>)}
          selectionMode="multiple"
          onChipClick={(id) => openEntity(EntityType.organization, id)}
          onCreate={(name) => createOrganizationByNameAction(name, userStore.user?.id)}
        >
          {(item) => FormAutocompleteItem({ children: item.name })}
        </FormAutocomplete>
      )}

      {userStore.canAccess(Resource.deals) && (
        <FormAutocomplete
          getItems={getDealsAction}
          id="dealIds"
          items={fetchedEntity?.deals ?? []}
          labelEndAddon={
            <OpenRelationLink currentEntityId={fetchedEntity?.id} currentEntityType="contact" targetEntityType="deal" />
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
        <TasksAutocompleteField entityId={fetchedEntity?.id} entityType="contact" tasks={fetchedEntity?.tasks ?? []} />
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
