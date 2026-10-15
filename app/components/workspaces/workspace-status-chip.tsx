import { useTranslations } from "next-intl";
import { Status } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";

export function WorkspaceStatusChip({ status }: { status: Status }) {
  const t = useTranslations();

  if (status === Status.active) return null;

  return (
    <AppChip className="shrink-0" size="sm" variant={USER_STATUS_COLORS_MAP[status]}>
      {status === Status.pendingAuthorization ? t("Workspaces.status.pending") : t("Common.userStatuses.inactive")}
    </AppChip>
  );
}
