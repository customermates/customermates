import { useTranslations } from "next-intl";

import type { Status } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { AppChip } from "@/components/chip/app-chip";
import { roleDisplayName } from "@/features/role/role-display-name";

type Props = {
  email: string;
  firstName: string;
  lastName: string;
  roleName?: string;
  roleIsSystemRole?: boolean;
  status: Status;
  avatarUrl?: string;
  emailVerified?: boolean;
};

export function UserDetailsAvatar({
  email,
  firstName,
  lastName,
  roleName,
  roleIsSystemRole = false,
  status,
  avatarUrl,
  emailVerified,
}: Props) {
  const t = useTranslations();
  const displayName = `${firstName} ${lastName}`.trim();

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={[firstName, lastName]} size="xl" src={avatarUrl} />

      <div className="flex flex-col min-w-0">
        <span className="truncate font-medium">{displayName}</span>

        <div className="mt-px flex w-full flex-col space-y-1 items-start">
          <span className="text-sm text-subdued truncate">{email}</span>

          <div className="flex w-full gap-2 items-center justify-start flex-wrap">
            {emailVerified !== undefined && (
              <AppChip variant={emailVerified ? "success" : "warning"}>
                {emailVerified ? t("EmailVerification.verified") : t("EmailVerification.notVerified")}
              </AppChip>
            )}

            <AppChip variant={USER_STATUS_COLORS_MAP[status]}>{t(`Common.userStatuses.${status}`)}</AppChip>

            {roleName && (
              <AppChip>
                {roleDisplayName({ isSystemRole: roleIsSystemRole, name: roleName }, t("RoleModal.systemName"))}
              </AppChip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
