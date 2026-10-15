import type { PlatformWorkspacePurpose } from "@/ee/agent-chat/agent-usage.service";

import { AGENT_CREDIT_MICROCENTS } from "@/core/commercial/agent-credits";

export type WorkspaceSetupBudget = { purpose: PlatformWorkspacePurpose; capMicrocents: number };
export type WorkspaceSetupBudgetKind = "plan" | "build";

export const WORKSPACE_SETUP_PLAN_CAP_CREDITS = 300;
export const WORKSPACE_SETUP_BUILD_CAP_CREDITS = 100;

export const WORKSPACE_SETUP_BUDGETS: Readonly<Record<WorkspaceSetupBudgetKind, WorkspaceSetupBudget>> = {
  plan: { purpose: "workspaceSetup", capMicrocents: WORKSPACE_SETUP_PLAN_CAP_CREDITS * AGENT_CREDIT_MICROCENTS },
  build: {
    purpose: "workspaceSetupBuild",
    capMicrocents: WORKSPACE_SETUP_BUILD_CAP_CREDITS * AGENT_CREDIT_MICROCENTS,
  },
};
