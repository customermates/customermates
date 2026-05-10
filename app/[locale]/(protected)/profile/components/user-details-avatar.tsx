import { useTranslations } from "next-intl";

import type { Status } from "@/generated/prisma";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { AppChip } from "@/components/chip/app-chip";

type Props = {
  email: string;
  firstName: string;
  lastName: string;
  roleName?: string;
  status: Status;
  avatarUrl?: string;
  emailVerified?: boolean;
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export function UserDetailsAvatar({ email, firstName, lastName, roleName, status, avatarUrl, emailVerified }: Props) {
  const t = useTranslations("Common");
  const tEmail = useTranslations("EmailVerification");
  const displayName = `${firstName} ${lastName}`.trim();

  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar className="shrink-0" size="lg">
        {avatarUrl && <AvatarImage alt={t("imageAlt.avatar", { name: displayName })} src={avatarUrl} />}

        <AvatarFallback>{getInitials(firstName, lastName)}</AvatarFallback>
      </Avatar>

      <div className="flex flex-col min-w-0">
        <span className="truncate font-medium">{displayName}</span>

        <div className="mt-px flex w-full flex-col space-y-1 items-start">
          <span className="text-sm text-subdued truncate">{email}</span>

          <div className="flex w-full gap-2 items-center justify-start flex-wrap">
            <AppChip variant={USER_STATUS_COLORS_MAP[status]}>{t(`userStatuses.${status}`)}</AppChip>

            {roleName && <AppChip variant="outline">{roleName}</AppChip>}

            {emailVerified !== undefined && (
              <AppChip variant={emailVerified ? "success" : "warning"}>
                {emailVerified ? tEmail("verified") : tEmail("notVerified")}
              </AppChip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
