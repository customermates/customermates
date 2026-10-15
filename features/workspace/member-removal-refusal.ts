import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { RemovableWorkspaceMember, RemoveWorkspaceMemberRepo } from "./remove-workspace-member.repo";

import { Status } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";

export const MEMBER_REMOVAL_REFUSALS = ["self", "left", "platformOperator", "lastAdmin"] as const;
export type MemberRemovalRefusal = (typeof MEMBER_REMOVAL_REFUSALS)[number];

export const MEMBER_REMOVAL_REFUSAL_CODES = {
  self: CustomErrorCode.workspaceMemberRemoveSelf,
  left: CustomErrorCode.workspaceMemberLeft,
  platformOperator: CustomErrorCode.workspaceMemberPlatformOperator,
  lastAdmin: CustomErrorCode.workspaceMemberLastAdmin,
} as const satisfies Record<MemberRemovalRefusal, CustomErrorCode>;

type RefusalChecks = {
  members: Pick<RemoveWorkspaceMemberRepo, "isPlatformOperatorCompanyWide">;
  roles: Pick<UpdateUserRoleRepo, "hasAnotherActiveSystemRoleUser">;
};

export async function memberRemovalRefusal(
  member: Pick<RemovableWorkspaceMember, "id" | "status" | "role" | "leftAt">,
  actorUserId: string,
  checks: RefusalChecks,
): Promise<MemberRemovalRefusal | null> {
  if (member.id === actorUserId) return "self";
  if (member.leftAt) return "left";
  if (await checks.members.isPlatformOperatorCompanyWide(member.id)) return "platformOperator";
  if (
    member.status === Status.active &&
    member.role?.isSystemRole &&
    !(await checks.roles.hasAnotherActiveSystemRoleUser(member.id))
  )
    return "lastAdmin";

  return null;
}
