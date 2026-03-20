"use client";

import type { GetResult } from "@/core/base/base-get.interactor";
import type { ServiceDto } from "@/features/services/service.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { useRootStore } from "@/core/stores/root-store.provider";
import { XAvatarStack } from "@/components/x-avatar-stack";
import { XChipStack } from "@/components/x-chip/x-chip-stack";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XCustomFieldValue } from "@/components/x-data-view/x-custom-column/x-custom-field-value";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";

type Props = {
  services: GetResult<ServiceDto>;
};

export const ServicesCard = observer(({ services }: Props) => {
  const t = useTranslations("");

  const { servicesStore, serviceModalStore, dealsStore, intlStore, userModalStore, dealModalStore } = useRootStore();

  useEffect(() => servicesStore.setItems(services), [services]);

  useEffect(() => {
    const cleanupUrlSync = servicesStore.withUrlSync();
    const unregisterDeals = dealsStore.registerOnChange(() => servicesStore.refresh());
    return () => {
      cleanupUrlSync();
      unregisterDeals();
    };
  }, []);

  function renderCell(item: ServiceDto, columnKey: React.Key): string | number | JSX.Element {
    switch (columnKey) {
      case "name":
        return <XDataViewCell className="text-x-sm">{item.name}</XDataViewCell>;

      case "amount":
        return <XDataViewCell>{intlStore.formatCurrency(item.amount)}</XDataViewCell>;

      case "users":
        return (
          <XAvatarStack items={item.users || []} onAvatarClick={(user) => void userModalStore.loadById(user.id)} />
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

      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;

      case "updatedAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.updatedAt)}</XDataViewCell>;

      default:
        const customColumn = servicesStore.customColumns.find((column) => column.id === columnKey);

        if (customColumn) return <XCustomFieldValue column={customColumn} item={item} store={servicesStore} />;

        return "";
    }
  }

  return (
    <XDataViewContainer
      renderCell={renderCell}
      store={servicesStore}
      title={t("ServicesCard.title")}
      onAdd={() => void serviceModalStore.add()}
      onRowAction={(item) => void serviceModalStore.loadById(item.id)}
    />
  );
});
