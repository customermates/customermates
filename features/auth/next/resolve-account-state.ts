import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getRouteGuardService } from "@/core/di";
import { WorkspaceChangedError } from "@/core/errors/workspace-changed-error";

export const resolveRequestAccountState = cache(async () => {
  try {
    return await getRouteGuardService().resolveAccountState();
  } catch (error) {
    if (error instanceof WorkspaceChangedError && !(await headers()).has("next-action")) notFound();
    throw error;
  }
});
