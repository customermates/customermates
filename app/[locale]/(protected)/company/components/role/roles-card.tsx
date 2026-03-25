"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { RoleModal } from "./role-modal";

import { type UserRoleDto } from "@/features/role/get-roles.interactor";
import { useRootStore } from "@/core/stores/root-store.provider";
import { XChip } from "@/components/x-chip/x-chip";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";

export const RolesCard = observer(() => {
  const { rolesStore, roleModalStore } = useRootStore();
  const t = useTranslations("");

  function renderCell(item: UserRoleDto, columnKey: React.Key) {
    switch (columnKey) {
      case "name":
        return (
          <XDataViewCell className="text-x-sm">
            {item.isSystemRole ? t("RoleModal.systemName") : (item?.name ?? "")}
          </XDataViewCell>
        );
      case "description":
        return (
          <XDataViewCell>
            {item.isSystemRole ? t("RoleModal.systemDescription") : (item?.description ?? "")}
          </XDataViewCell>
        );
      case "type":
        return <XChip>{item.isSystemRole ? t("RolesCard.system") : t("RolesCard.custom")}</XChip>;
      default:
        return "";
    }
  }

  return (
    <>
      <XDataViewContainer
        isSearchable={false}
        renderCell={renderCell}
        store={rolesStore}
        title={t("RolesCard.title")}
        onAdd={roleModalStore.add}
        onRowAction={(item) => {
          roleModalStore.setRole(item);
          roleModalStore.open();
        }}
      />

      <RoleModal store={roleModalStore} />
    </>
  );
});
