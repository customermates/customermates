import type { InteractorFailure } from "@/core/validation/validation.utils";

import { CLOUD_DAILY_WORKSPACE_CREATION_LIMIT, CLOUD_WORKSPACE_CREATION_LIMIT } from "@/core/commercial/plan-catalog";
import { failAuthorization, failConflict, failRateLimit } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";

const DAY_MS = 24 * 60 * 60 * 1000;

type WorkspaceCreationCounts = {
  countCreatedWorkspacesUnscoped(authUserId: string): Promise<number>;
  countWorkspacesCreatedSinceUnscoped(authUserId: string, since: Date): Promise<number>;
};

export async function workspaceCreationRefusal(
  login: { authUserId: string; emailVerified: boolean | null },
  counts: WorkspaceCreationCounts,
  options: { requireVerifiedEmail: boolean },
): Promise<InteractorFailure | null> {
  if (env.APP_MODE !== "cloud") return null;
  if (options.requireVerifiedEmail && !login.emailVerified) return failAuthorization(CustomErrorCode.emailNotVerified);

  if ((await counts.countCreatedWorkspacesUnscoped(login.authUserId)) >= CLOUD_WORKSPACE_CREATION_LIMIT)
    return failConflict(CustomErrorCode.workspaceLimitReached, [], { limit: CLOUD_WORKSPACE_CREATION_LIMIT });

  const since = new Date(Date.now() - DAY_MS);
  if (
    (await counts.countWorkspacesCreatedSinceUnscoped(login.authUserId, since)) >= CLOUD_DAILY_WORKSPACE_CREATION_LIMIT
  ) {
    return failRateLimit(CustomErrorCode.workspaceDailyLimitReached, [], {
      limit: CLOUD_DAILY_WORKSPACE_CREATION_LIMIT,
    });
  }

  return null;
}
