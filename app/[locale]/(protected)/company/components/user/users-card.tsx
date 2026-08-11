"use client";

import type { UserDto } from "@/features/user/user.schema";
import type { RoleDto } from "@/features/role/get-roles.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ColumnDef } from "@tanstack/react-table";

import { observer } from "mobx-react-lite";
import { useLayoutEffect, useMemo } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/ui/avatar";
import { AppChip } from "@/components/chip/app-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { DataViewContainer, useDataViewSync } from "@/components/data-view";
import { roleDisplayName } from "@/features/role/role-display-name";

type Props = {
  initialUsers: GetResult<UserDto>;
  initialRoles: GetResult<RoleDto>;
};

export const UsersCard = observer(({ initialUsers, initialRoles }: Props) => {
  const t = useTranslations();
  const { usersStore, userModalStore, companyInviteModalStore, rolesStore, intlStore } = useRootStore();
  const { canManage } = usersStore;
  const roles = rolesStore.items;

  useDataViewSync(usersStore, initialUsers);
  useLayoutEffect(() => rolesStore.setItems(initialRoles), [initialRoles]);

  const columns = useMemo<ColumnDef<UserDto>[]>(() => {
    return [
      {
        id: "name",
        accessorKey: "firstName",
        header: t("Common.table.columns.name"),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar name={[item.firstName, item.lastName]} src={item.avatarUrl} />

              <div className="max-w-full overflow-hidden">
                <div className="text-sm truncate">{`${item?.firstName} ${item?.lastName}`.trim()}</div>

                <div className="text-muted-foreground text-xs truncate">{item?.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        id: "email",
        accessorKey: "email",
        header: t("Common.table.columns.email"),
        cell: ({ row }) => <span className="text-sm">{row.original.email}</span>,
      },
      {
        id: "role",
        header: t("Common.table.columns.role"),
        cell: ({ row }) => {
          const role = roles.find((r) => r.id === row.original.roleId);
          return role ? <AppChip>{roleDisplayName(role, t("RoleModal.systemName"))}</AppChip> : <></>;
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
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: t("Common.table.columns.updatedAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.updatedAt)}</span>
        ),
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: t("Common.table.columns.createdAt"),
        cell: ({ row }) => (
          <span className="text-sm">{intlStore.formatNumericalShortDateTime(row.original.createdAt)}</span>
        ),
      },
    ];
  }, [t, roles, intlStore]);

  return (
    <DataViewContainer
      anchorScope="company-members"
      columns={columns}
      store={usersStore}
      tableSkeletonVariant="member"
      onAdd={
        canManage
          ? () => {
              void companyInviteModalStore.generateInviteLink();
              companyInviteModalStore.open();
            }
          : undefined
      }
      onRowClick={(item) => void userModalStore.loadById(item.id)}
    />
  );
});
