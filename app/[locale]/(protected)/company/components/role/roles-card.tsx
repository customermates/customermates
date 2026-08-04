"use client";

import type { RoleDto } from "@/features/role/get-roles.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";

import { RoleModal } from "./role-modal";

import { useRootStore } from "@/core/stores/root-store.provider";
import { AppChip } from "@/components/chip/app-chip";
import { DataViewContainer } from "@/components/data-view";

type Props = {
  initialRoles: GetResult<RoleDto>;
};

export const RolesCard = observer(({ initialRoles }: Props) => {
  const { rolesStore, roleModalStore } = useRootStore();
  const t = useTranslations();

  useEffect(() => rolesStore.setItems(initialRoles), [initialRoles]);

  const columns = useMemo<ColumnDef<RoleDto>[]>(() => {
    return [
      {
        id: "name",
        accessorKey: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => (
          <span className="text-sm truncate">
            {row.original.isSystemRole ? t("RoleModal.systemName") : (row.original?.name ?? "")}
          </span>
        ),
      },
      {
        id: "type",
        header: t("Common.table.columns.type"),
        cell: ({ row }) => (
          <AppChip>{row.original.isSystemRole ? t("RolesCard.system") : t("RolesCard.custom")}</AppChip>
        ),
      },
      {
        id: "description",
        header: t("Common.table.columns.description"),
        cell: ({ row }) => (
          <span className="text-sm truncate">
            {row.original.isSystemRole ? t("RoleModal.systemDescription") : (row.original?.description ?? "")}
          </span>
        ),
      },
    ];
  }, [t]);

  return (
    <>
      <DataViewContainer
        anchorScope="company-roles"
        columns={columns}
        isSearchable={false}
        store={rolesStore}
        onAdd={roleModalStore.add}
        onRowClick={(item) => {
          roleModalStore.setRole(item);
          roleModalStore.open();
        }}
      />

      <RoleModal store={roleModalStore} />
    </>
  );
});
