"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { DealDto } from "@/features/deals/deal.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { XAvatarStack } from "@/components/x-avatar-stack";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XCustomFieldValue } from "@/components/x-data-view/x-custom-column/x-custom-field-value";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";

type Props = {
  deals: GetResult<DealDto>;
};

export const DealsCard = observer(({ deals }: Props) => {
  const {
    dealsStore,
    dealModalStore,
    intlStore,
    organizationsStore,
    contactsStore,
    servicesStore,
    organizationModalStore,
    serviceModalStore,
    userModalStore,
    contactModalStore,
  } = useRootStore();
  const t = useTranslations("");

  useEffect(() => dealsStore.setItems(deals), [deals]);

  useEffect(() => {
    const cleanupUrlSync = dealsStore.withUrlSync();
    const unregisterOrgs = organizationsStore.registerOnChange(() => dealsStore.refresh());
    const unregisterContacts = contactsStore.registerOnChange(() => dealsStore.refresh());
    const unregisterServices = servicesStore.registerOnChange(() => dealsStore.refresh());
    return () => {
      cleanupUrlSync();
      unregisterOrgs();
      unregisterContacts();
      unregisterServices();
    };
  }, []);

  function renderCell(item: DealDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name":
        return <XDataViewCell className="text-x-sm">{item?.name ?? ""}</XDataViewCell>;

      case "organizations":
        return (
          <XChipStack
            items={item.organizations.map((org) => ({ id: org.id, label: org.name }))}
            size="sm"
            variant="flat"
            onChipClick={(org) => void organizationModalStore.loadById(org.id)}
          />
        );

      case "services":
        return (
          <XChipStack
            items={item.services.map((service) => ({
              id: service.id,
              label: `${service.name} – ${intlStore.formatCurrency(service.amount * service.quantity)}`,
            }))}
            size="sm"
            variant="flat"
            onChipClick={(service) => void serviceModalStore.loadById(service.id)}
          />
        );

      case "contacts":
        return (
          <XAvatarStack
            items={item.contacts || []}
            onAvatarClick={(contact) => void contactModalStore.loadById(contact.id)}
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

      case "totalQuantity":
        return <XDataViewCell>{intlStore.formatNumber(item.totalQuantity)}</XDataViewCell>;

      case "totalValue":
        return <XDataViewCell>{intlStore.formatCurrency(item.totalValue)}</XDataViewCell>;

      default:
        const customColumn = dealsStore.customColumns.find((column) => column.id === columnKey);

        if (customColumn) return <XCustomFieldValue column={customColumn} item={item} store={dealsStore} />;

        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={dealsStore}
      title={t("DealsCard.title")}
      onAdd={() => void dealModalStore.add()}
      onRowAction={(item) => void dealModalStore.loadById(item.id)}
    />
  );
});
