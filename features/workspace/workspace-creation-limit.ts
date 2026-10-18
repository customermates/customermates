import { CLOUD_WORKSPACE_CREATION_LIMIT } from "@/core/commercial/plan-catalog";
import { env } from "@/env";

export function workspaceCreationLimit(): number | null {
  return env.APP_MODE === "cloud" ? CLOUD_WORKSPACE_CREATION_LIMIT : null;
}
