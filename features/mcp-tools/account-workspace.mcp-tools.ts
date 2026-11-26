import { z } from "zod";
import { Locale } from "@/generated/prisma";

import type { McpToolResult } from "./mcp-tool";
import type { WorkspaceSetupStatusView } from "@/ee/workspace-setup/workspace-setup-status";

import { mcpInteractorFailure, runInteractor, toonResult } from "./utils";

import {
  getAdvanceAgentWorkspaceSetupInteractor,
  getCreateWorkspaceInteractor,
  getListAccountWorkspacesInteractor,
  getStartAgentWorkspaceSetupInteractor,
} from "@/core/di";
import {
  AGENT_SETUP_DESCRIPTION_MAX_LENGTH,
  AGENT_SETUP_PRICING,
  AGENT_SETUP_PURPOSES,
  AGENT_SETUP_WORK_WITH,
} from "@/ee/workspace-setup/start-agent-workspace-setup.interactor";
import { isAppLocale } from "@/i18n/locale-registry";
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
  description: z
    .string()
    .trim()
    .min(1)
    .max(AGENT_SETUP_DESCRIPTION_MAX_LENGTH)
    .optional()
    .describe(
      "One or two sentences about the business in the owner's words: what it does and for whom. When given, Mate builds the workspace from it on the server: lists, fields, pipeline, views, dashboard and Knowledge Base",
    ),
  workWith: z
    .enum(AGENT_SETUP_WORK_WITH)
    .optional()
    .describe("Who the business works with: clients (ongoing relationships), customers (one-off buyers) or ownWork"),
  purpose: z
    .array(z.enum(AGENT_SETUP_PURPOSES))
    .max(AGENT_SETUP_PURPOSES.length)
    .optional()
    .describe("What the workspace keeps track of"),
  mainSteps: z
    .array(z.string().trim().min(1).max(80))
    .max(12)
    .optional()
    .describe("Pipeline steps of the main tracked work, in order"),
  pricing: z.enum(AGENT_SETUP_PRICING).optional().describe("How the business charges"),
  exampleRecords: z.boolean().optional().describe("Whether Mate adds example records (default true)"),
});

const SetupStartSchema = z
  .object({
    status: z.enum(["planning", "notStarted"]),
    setupId: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .nullable();

const CreateWorkspaceOutputSchema = z.object({
  companyId: z.string(),
  slug: z.string().nullable(),
  trial: z.boolean(),
  setup: SetupStartSchema,
});

type CreateWorkspaceParams = z.infer<typeof CreateWorkspaceSchema>;

function setupLocale(displayLanguage: CreateWorkspaceParams["displayLanguage"]) {
  return displayLanguage && isAppLocale(displayLanguage) ? displayLanguage : undefined;
}

async function startSetup(companyId: string, params: CreateWorkspaceParams, description: string) {
  const locale = setupLocale(params.displayLanguage);
  const started = await getStartAgentWorkspaceSetupInteractor().invoke({
    companyId,
    description,
    teamSize: params.teamSize,
    ...(locale ? { locale } : {}),
    ...(params.workWith ? { workWith: params.workWith } : {}),
    ...(params.purpose ? { purpose: params.purpose } : {}),
    ...(params.mainSteps ? { mainSteps: params.mainSteps } : {}),
    ...(params.pricing ? { pricing: params.pricing } : {}),
    ...(params.exampleRecords === undefined ? {} : { exampleRecords: params.exampleRecords }),
  });
  return started.ok
    ? { status: "planning" as const, setupId: started.data.setupId, reason: null }
    : { status: "notStarted" as const, setupId: null, reason: mcpInteractorFailure(started.error).text };
}

async function createWorkspace(params: CreateWorkspaceParams): Promise<McpToolResult> {
  const created = await getCreateWorkspaceInteractor().invokeForAgent({
    name: params.name,
    teamSize: params.teamSize,
    ...(params.displayLanguage ? { displayLanguage: params.displayLanguage } : {}),
  });
  if (!created.ok) return mcpInteractorFailure(created.error);
  const description = params.description?.trim();
  const setup = description ? await startSetup(created.data.companyId, params, description) : null;
  return toonResult({ ...created.data, setup });
}

export const createWorkspaceTool = {
  name: "create_workspace",
  title: "Create workspace",
  description:
    "Creates a new workspace for the signed-in account, with the account as its administrator, and returns { companyId, slug, trial, setup }. The slug is the value of the workspace argument for work in the new workspace; trial is true when it starts with the free trial (only the first workspace a login creates does). " +
    "With a description, Mate plans and builds the whole workspace on the server, the same setup the app's onboarding runs: setup.status planning means it started and the workspace setup status reports its progress; notStarted carries the reason, for example a plan without Mate, and leaves an empty workspace. Without a description the workspace starts empty and setup is null. " +
    "Cloud only; needs a verified email address and an OAuth connection approved for the whole account, allows at most 3 new workspaces per account in any 24 hours, and follows the terms the account accepted.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "account" as const,
  inputSchema: CreateWorkspaceSchema,
  outputSchema: CreateWorkspaceOutputSchema,
  execute: (params: CreateWorkspaceParams) => createWorkspace(params),
};

const SetupStatusOutputSchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
  status: z.string().nullable(),
  plan: z.object({ status: z.string(), error: z.string().nullable() }).nullable(),
  currentPhase: z.string().nullable(),
  phases: z.array(z.object({ phase: z.string(), status: z.string(), error: z.string().nullable() })),
  knowledgeBase: z.object({ pagesPlanned: z.number(), pagesWritten: z.number() }).nullable(),
  finishedAt: z.string().nullable(),
});

function setupStatusResult(view: WorkspaceSetupStatusView) {
  const setup = view.available ? view.setup : null;
  return toonResult({
    available: view.available,
    reason: view.available ? null : view.reason,
    status: setup?.status ?? null,
    plan: setup ? { status: setup.plan.status, error: setup.plan.error } : null,
    currentPhase: setup?.currentPhase ?? null,
    phases: (setup?.phases ?? []).map((phase) => ({ phase: phase.key, status: phase.status, error: phase.error })),
    knowledgeBase: setup?.knowledgeBase ?? null,
    finishedAt: setup?.finishedAt ?? null,
  });
}

export const getWorkspaceSetupStatusTool = {
  name: "get_workspace_setup_status",
  title: "Get workspace setup status",
  description:
    "Reports the Mate setup of the workspace: status interview, planning, planned, building, completed or failed, the plan generation state with its error, the build phases (knowledgeBase, dataModel, views, records, dashboard) with status and error, the current phase, the Knowledge Base pages planned and written, and finishedAt. " +
    "For a setup that the workspace creation started from a description, a finished plan is built right away, so a read during planned moves it to building. status null means no setup ran; available false carries the reason, such as configured for a workspace that already has lists.",
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({}),
  outputSchema: SetupStatusOutputSchema,
  execute: () => runInteractor(getAdvanceAgentWorkspaceSetupInteractor().invoke(), setupStatusResult),
};
