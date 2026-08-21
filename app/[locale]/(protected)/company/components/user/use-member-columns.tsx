"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { UserDto } from "@/features/user/user.schema";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Avatar } from "@/components/ui/avatar";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { roleDisplayName } from "@/features/role/role-display-name";

export function useMemberColumns(): ColumnDef<UserDto>[] {
  const { rolesStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const t = useTranslations();
  const roles = rolesStore.items;

  return useMemo<ColumnDef<UserDto>[]>(
    () => [
      {
        accessorKey: "firstName",
        id: "name",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={[item.firstName, item.lastName]} src={item.avatarUrl} />

              <div className="max-w-full overflow-hidden">
                <div className="truncate text-sm">{`${item.firstName} ${item.lastName}`.trim()}</div>

                <div className="truncate text-xs text-muted-foreground">{item.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "email",
        id: "email",
        header: t("Common.table.columns.email"),
        cell: ({ row }) => <span className="text-sm">{row.original.email}</span>,
      },
      {
        id: "role",
        header: t("Common.table.columns.role"),
        cell: ({ row }) => {
          const role = roles.find((item) => item.id === row.original.roleId);
          return role ? <AppChip>{roleDisplayName(role, t("RoleModal.systemName"))}</AppChip> : null;
        },
      },
      {
        id: "status",
        header: t("Common.table.columns.status"),
        cell: ({ row }) => (
          <AppChip variant={USER_STATUS_COLORS_MAP[row.original.status]}>
            {t(`Common.userStatuses.${row.original.status}`)}
          </AppChip>
        ),
      },
      {
        accessorKey: "updatedAt",
        id: "updatedAt",
        header: t("Common.table.columns.updatedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.updatedAt)}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        id: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [intlStore, roles, t],
  );
}
