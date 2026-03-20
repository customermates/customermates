"use client";

import type { ContactDto } from "@/features/contacts/contact.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Avatar } from "@heroui/avatar";

import { XAvatarStack } from "@/components/x-avatar-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { type GetResult } from "@/core/base/base-get.interactor";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XCustomFieldValue } from "@/components/x-data-view/x-custom-column/x-custom-field-value";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";

type Props = {
  contacts: GetResult<ContactDto>;
};

export const ContactsCard = observer(({ contacts }: Props) => {
  const t = useTranslations("");

  const {
    contactsStore,
    contactModalStore,
    organizationsStore,
    organizationModalStore,
    userModalStore,
    dealsStore,
    dealModalStore,
    intlStore,
  } = useRootStore();

  useEffect(() => contactsStore.setItems(contacts), [contacts]);

  useEffect(() => {
    const cleanupUrlSync = contactsStore.withUrlSync();
    const unregisterDeals = dealsStore.registerOnChange(() => contactsStore.refresh());
    const unregisterOrgs = organizationsStore.registerOnChange(() => contactsStore.refresh());
    return () => {
      cleanupUrlSync();
      unregisterDeals();
      unregisterOrgs();
    };
  }, []);

  function renderCell(item: ContactDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name":
        return (
          <div className="flex gap-2 items-center justify-start">
            <Avatar showFallback className="shrink-0" name={`${item?.firstName} ${item?.lastName}`.trim()} size="sm" />

            <XDataViewCell className="text-x-sm">{`${item?.firstName} ${item?.lastName}`.trim()}</XDataViewCell>
          </div>
        );

      case "organizations":
        return (
          <XChipStack
            items={item.organizations.map((org) => ({ id: org.id, label: org.name }))}
            size="sm"
            variant="flat"
            onChipClick={(org) => void organizationModalStore.loadById(org.id)}
          />
        );

      case "deals":
        return (
          <XChipStack
            items={item.deals.map((deal) => ({
              id: deal.id,
              label: deal.name,
            }))}
            size="sm"
            variant="flat"
            onChipClick={(deal) => void dealModalStore.loadById(deal.id)}
          />
        );

      case "users":
        return (
          <XAvatarStack items={item.users || []} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
        );

      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;

      case "updatedAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.updatedAt)}</XDataViewCell>;

      default:
        const customColumn = contactsStore.customColumns.find((column) => column.id === columnKey);

        if (customColumn) return <XCustomFieldValue column={customColumn} item={item} store={contactsStore} />;

        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={contactsStore}
      title={t("ContactsCard.title")}
      onAdd={() => void contactModalStore.add()}
      onRowAction={(item) => void contactModalStore.loadById(item.id)}
    />
  );
});
