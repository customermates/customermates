"use client";

import type { UserDto } from "@/features/user/user.schema";

import { PlusIcon } from "@heroicons/react/24/outline";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@heroui/button";
import { Avatar } from "@heroui/avatar";

import { XChip } from "@/components/x-chip/x-chip";
import { XIcon } from "@/components/x-icon";
import { XTooltip } from "@/components/x-tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { XDataViewContainer } from "@/components/x-data-view/x-data-view-container";
import { XDataViewCell } from "@/components/x-data-view/x-data-view-cell";

type Props = {
  isCompanyOnboarding: boolean;
};

export const UsersCard = observer(({ isCompanyOnboarding }: Props) => {
  const t = useTranslations("");
  const { usersStore, userModalStore, companyInviteModalStore, rolesStore, intlStore } = useRootStore();
  const { canManage, isDisabled } = usersStore;
  const roles = rolesStore.items;

  useEffect(() => {
    const cleanupUrlSync = usersStore.withUrlSync();
    return () => cleanupUrlSync();
  }, []);

  function renderCell(item: UserDto, columnKey: React.Key): string | number | JSX.Element {
    const cellValue = item[columnKey as keyof UserDto];

    switch (columnKey) {
      case "name":
        return (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              showFallback
              className="shrink-0"
              name={`${item?.firstName} ${item?.lastName}`.trim()}
              size="md"
              src={item.avatarUrl ?? undefined}
            />

            <div className="max-w-full overflow-hidden">
              <XDataViewCell className="text-x-sm max-w-full">
                {`${item?.firstName} ${item?.lastName}`.trim()}
              </XDataViewCell>

              <XDataViewCell className="text-subdued text-xs max-w-full">{item?.email}</XDataViewCell>
            </div>
          </div>
        );
      case "email":
        return <XDataViewCell>{item.email}</XDataViewCell>;
      case "status":
        return <XChip color={USER_STATUS_COLORS_MAP[item.status]}>{t(`Common.userStatuses.${item.status}`)}</XChip>;
      case "role": {
        const role = roles.find((r) => r.id === item.roleId);

        return role ? <XChip>{role?.name}</XChip> : "";
      }
      case "createdAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.createdAt)}</XDataViewCell>;
      case "updatedAt":
        return <XDataViewCell>{intlStore.formatNumericalShortDateTime(item.updatedAt)}</XDataViewCell>;
      default:
        return cellValue?.toString() ?? "";
    }
  }

  return (
    <XDataViewContainer
      actions={
        canManage && (
          <XTooltip content={t("Common.ariaLabels.tooltipAdd")}>
            <Button
              isIconOnly
              color="primary"
              isDisabled={isDisabled}
              size="sm"
              variant="flat"
              onPress={() => {
                void companyInviteModalStore.generateInviteLink();
                companyInviteModalStore.setIsDisabled(isCompanyOnboarding);
                companyInviteModalStore.open();
              }}
            >
              <XIcon icon={PlusIcon} />
            </Button>
          </XTooltip>
        )
      }
      renderCell={renderCell}
      store={usersStore}
      title={t("UsersCard.title")}
      onRowAction={(item) => void userModalStore.loadById(item.id)}
    />
  );
});
