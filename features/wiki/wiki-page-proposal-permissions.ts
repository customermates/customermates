import type { TenantUser } from "@/features/user/user.schema";
import type { WikiPageProposalAction } from "./wiki-page-proposal.schema";

import { Action, Resource } from "@/generated/prisma";

const PROPOSAL_ACTION_PERMISSION: Record<WikiPageProposalAction, Action> = {
  create: Action.create,
  update: Action.update,
  delete: Action.delete,
};

export function canApplyWikiProposalAction(user: Readonly<TenantUser>, action: WikiPageProposalAction): boolean {
  if (!user.role) return false;
  if (user.role.isSystemRole) return true;
  const required = PROPOSAL_ACTION_PERMISSION[action];
  return user.role.permissions.some(
    (permission) => permission.resource === Resource.wiki && permission.action === required,
  );
}
