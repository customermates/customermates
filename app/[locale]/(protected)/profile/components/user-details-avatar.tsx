import { User } from "@heroui/user";
import { useTranslations } from "next-intl";

import type { Status } from "@/generated/prisma";

import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { XChip } from "@/components/x-chip/x-chip";

type Props = {
  email: string;
  firstName: string;
  lastName: string;
  roleName?: string;
  status: Status;
  avatarUrl?: string;
};

export function UserDetailsAvatar({ email, firstName, lastName, roleName, status, avatarUrl }: Props) {
  const t = useTranslations("Common");

  return (
    <User
      avatarProps={{
        size: "lg",
        src: avatarUrl,
        name: `${firstName} ${lastName}`.trim(),
        alt: t("imageAlt.avatar", { name: `${firstName} ${lastName}`.trim() }),
      }}
      description={
        <div className="mt-px flex w-full flex-col space-y-1 items-start">
          <span>{email}</span>

          <div className="flex w-full gap-2 items-start justify-start">
            <XChip color={USER_STATUS_COLORS_MAP[status]}>{t(`userStatuses.${status}`)}</XChip>

            {roleName && <XChip color="default">{roleName}</XChip>}
          </div>
        </div>
      }
      name={`${firstName} ${lastName}`.trim()}
    />
  );
}
