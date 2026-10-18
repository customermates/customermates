import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { env } from "@/env";

type WorkspaceCreatorRepo = Pick<WorkspaceMembershipRepo, "hasConsumedTrialUnscoped" | "hasCreatedWorkspaceUnscoped">;

export async function startsWithTrial(authUserId: string, repo: WorkspaceCreatorRepo): Promise<boolean> {
  if (env.APP_MODE !== "cloud") return true;
  if (await repo.hasConsumedTrialUnscoped(authUserId)) return false;

  return !(await repo.hasCreatedWorkspaceUnscoped(authUserId));
}
