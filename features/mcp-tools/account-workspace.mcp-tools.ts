import { z } from "zod";
import { Locale } from "@/generated/prisma";

import { runInteractor, toonResult } from "./utils";

import { getCreateWorkspaceInteractor, getListAccountWorkspacesInteractor } from "@/core/di";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/features/workspace/workspace.schema";
import { TEAM_SIZES } from "@/features/onboarding-funnel/team-size";
import { WorkspacePlanFactsSchema } from "@/features/workspace/workspace-plan-facts.schema";

export const PLAN_FACTS_DESCRIPTION =
  "plan holds the workspace's plan facts on Cloud (null elsewhere): plan is the current plan id, onFreePlan whether it runs on the free plan, trialDaysLeft the days left in the free trial (null when not in a trial), lostOnFree what stops working on the free plan as { kind, count } entries, keepsItRunning the cheapest plan that keeps all of it running (null when nothing would be lost) and choosePlanUrl the absolute link to the workspace's billing settings where a plan is chosen.";

const ListWorkspacesOutputSchema = z.object({
  workspaces: z.array(
    z.object({
      name: z.string().nullable(),
      slug: z.string(),
      companyId: z.string(),
      role: z.string().nullable(),
      isAdmin: z.boolean(),
      setUp: z.boolean().nullable(),
      records: z.number().nullable(),
      usable: z.boolean(),
      unavailableReason: z.string().nullable(),
      unavailableExplanation: z.string().nullable(),
      plan: WorkspacePlanFactsSchema.nullable(),
    }),
  ),
  canCreateWorkspace: z.boolean(),
});

export const listWorkspacesTool = {
  name: "list_workspaces",
  title: "List workspaces",
  description:
    "Returns every workspace of the signed-in account: name, slug (the value of the workspace argument of the other tools), companyId, the account's role there, setUp (true once the workspace holds records, false while it is still empty; null when it cannot be used), records (the record count), usable with the unavailableReason and a plain unavailableExplanation when the workspace cannot be used through this connection, and plan. " +
    PLAN_FACTS_DESCRIPTION +
    " canCreateWorkspace tells whether this connection may create another workspace. With an API key only the key's own workspace is listed.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "account" as const,
  inputSchema: z.object({}),
  outputSchema: ListWorkspacesOutputSchema,
  execute: () => runInteractor(getListAccountWorkspacesInteractor().invoke(), (data) => toonResult(data)),
};

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(WORKSPACE_NAME_MAX_LENGTH).describe("Workspace name, usually the company name"),
  teamSize: z
    .enum(TEAM_SIZES)
    .describe(
      "How many people will work in it: solo (just one person), small (2-5), medium (6-20), large (more than 20)",
    ),
  displayLanguage: z
    .enum(Locale)
    .optional()
    .describe(
      "App language of the account in the new workspace; system follows the browser. Defaults to the language already in use",
    ),
});

const CreateWorkspaceOutputSchema = z.object({
  companyId: z.string(),
  slug: z.string().nullable(),
  trial: z.boolean(),
});

export const createWorkspaceTool = {
  name: "create_workspace",
  title: "Create workspace",
  description:
    "Creates a new workspace for the signed-in account, with the account as its administrator, and returns { companyId, slug, trial }. The slug is the value of the workspace argument for work in the new workspace; trial is true when it starts with the free trial (only the first workspace a login creates does). Cloud only; needs a verified email address and an OAuth connection, allows at most 3 new workspaces per account in any 24 hours, and follows the terms the account accepted when it connected.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "account" as const,
  inputSchema: CreateWorkspaceSchema,
  outputSchema: CreateWorkspaceOutputSchema,
  execute: (params: z.infer<typeof CreateWorkspaceSchema>) =>
    runInteractor(
      getCreateWorkspaceInteractor().invokeForAgent({
        name: params.name,
        teamSize: params.teamSize,
        ...(params.displayLanguage ? { displayLanguage: params.displayLanguage } : {}),
      }),
      (data) => toonResult(data),
    ),
};
