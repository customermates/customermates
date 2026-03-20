"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { OrganizationDto } from "@/features/organizations/organization.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { XAvatarStack } from "@/components/x-avatar-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XCustomFieldValue } from "@/components/x-data-view/x-custom-column/x-custom-field-value";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";
type Props = {
  organizations: GetResult<OrganizationDto>;
};

export const OrganizationsCard = observer(({ organizations }: Props) => {
  const t = useTranslations("");

  const {
    contactsStore,
    organizationsStore,
    organizationModalStore,
    userModalStore,
    contactModalStore,
    dealsStore,
    dealModalStore,
    intlStore,
  } = useRootStore();

  useEffect(() => organizationsStore.setItems(organizations), [organizations]);

  useEffect(() => {
    const cleanupUrlSync = organizationsStore.withUrlSync();
    const unregisterContacts = contactsStore.registerOnChange(() => organizationsStore.refresh());
    const unregisterDeals = dealsStore.registerOnChange(() => organizationsStore.refresh());
    return () => {
      cleanupUrlSync();
      unregisterContacts();
      unregisterDeals();
    };
  }, []);

  function renderCell(item: OrganizationDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name":
        return <XDataViewCell className="text-x-sm">{item?.name ?? ""}</XDataViewCell>;

      case "contacts":
        return (
          <XAvatarStack
            items={item.contacts || []}
            onAvatarClick={(contact) => void contactModalStore.loadById(contact.id)}
          />
        );

      case "deals":
        return (
          <XChipStack
            items={item.deals.map((deal) => ({ id: deal.id, label: deal.name }))}
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
        const customColumn = organizationsStore.customColumns.find((column) => column.id === columnKey);

        if (customColumn) return <XCustomFieldValue column={customColumn} item={item} store={organizationsStore} />;

        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={organizationsStore}
      title={t("OrganizationCard.title")}
      onAdd={() => void organizationModalStore.add()}
      onRowAction={(item) => void organizationModalStore.loadById(item.id)}
    />
  );
});
