import type { WorkspaceMembershipRow } from "./workspace-membership.repo";

import { Status } from "@/generated/prisma";

const STATUS_PREFERENCE: readonly Status[] = [Status.active, Status.pendingAuthorization, Status.inactive];

export function nextLastUsedCompanyId(
  memberships: readonly Pick<WorkspaceMembershipRow, "companyId" | "status">[],
  leftCompanyId: string,
): string | null {
  const others = memberships.filter((membership) => membership.companyId !== leftCompanyId);
  const preferred = [...others].sort(
    (a, b) => STATUS_PREFERENCE.indexOf(a.status) - STATUS_PREFERENCE.indexOf(b.status),
  );

  return preferred[0]?.companyId ?? null;
}
