import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { env } from "@/env";

type WorkspaceCreatorRepo = Pick<WorkspaceMembershipRepo, "hasCreatedWorkspaceUnscoped">;

export async function startsWithTrial(authUserId: string, repo: WorkspaceCreatorRepo): Promise<boolean> {
  if (env.APP_MODE !== "cloud") return true;

  return !(await repo.hasCreatedWorkspaceUnscoped(authUserId));
}
