"use server";

import { getJoinWorkspaceInteractor } from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function joinWorkspaceAction(intent: string) {
  return serializeResult(getJoinWorkspaceInteractor().invoke({ intent }));
}
