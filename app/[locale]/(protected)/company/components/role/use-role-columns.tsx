"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { RoleDto } from "@/features/role/get-roles.interactor";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";

export function useRoleColumns(): ColumnDef<RoleDto>[] {
  const t = useTranslations();
  return useMemo<ColumnDef<RoleDto>[]>(
    () => [
      {
        accessorKey: "name",
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => (
          <span className="truncate text-sm">
            {row.original.isSystemRole ? t("RoleModal.systemName") : (row.original.name ?? "")}
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
          <span className="truncate text-sm">
            {row.original.isSystemRole ? t("RoleModal.systemDescription") : (row.original.description ?? "")}
          </span>
        ),
      },
    ],
    [t],
  );
}
