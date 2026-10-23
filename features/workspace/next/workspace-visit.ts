import "server-only";

import { headers } from "next/headers";

import { getActiveWorkspaceService, getAuthService } from "@/core/di";
import { env } from "@/env";
import { resolveRequestAccountState } from "@/features/auth/next/resolve-account-state";

export async function rememberRequestedWorkspace(slug: string): Promise<void> {
  const account = await resolveRequestAccountState();
  if (env.APP_MODE === "demo") return;
  if (!account.user || account.user.company?.slug !== slug) return;
  if ((await headers()).has("next-router-prefetch")) return;

  const session = await getAuthService().getSession();
  if (!session) return;

  await getActiveWorkspaceService().rememberLastUsed(session, account.user.companyId);
}
