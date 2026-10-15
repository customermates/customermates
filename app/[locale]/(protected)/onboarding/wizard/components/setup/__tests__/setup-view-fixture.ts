import type { WorkspaceSetupPhaseView, WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";

const PHASES: WorkspaceSetupPhase[] = ["knowledgeBase", "dataModel", "views", "records", "dashboard"];

export const SETUP_ID = "7d0f8a62-55c4-4d55-9a4c-0c2f1d1b9f10";

export function setupPlan(): SetupPlan {
  return {
    version: 1,
    workspace: { currency: "EUR", dashboardAudience: "team" },
    recordModel: {
      lists: [
        { key: "contact", label: "Contact", pluralLabel: "Contacts", description: "", icon: "contact", role: "people" },
        { key: "deal", label: "Deal", pluralLabel: "Deals", description: "", icon: "handshake", role: "deals" },
        { key: "task", label: "Task", pluralLabel: "Tasks", description: "", icon: "check", role: "tasks" },
        {
          key: "project",
          label: "Project",
          pluralLabel: "Projects",
          description: "",
          icon: "folder",
          color: "info",
        },
      ],
      fields: [
        { key: "deal.budget", label: "Budget", valueType: "currency", required: false, multiple: false, options: [] },
        {
          key: "deal.stage",
          label: "Stage",
          valueType: "select",
          required: false,
          multiple: false,
          options: [
            { key: "lead", label: "Lead", weight: 10, color: "secondary" },
            { key: "demo", label: "Demo", weight: 40 },
            { key: "won", label: "Won", weight: 100, color: "success", outcome: "won" },
          ],
        },
        {
          key: "project.phase",
          label: "Phase",
          valueType: "select",
          required: false,
          multiple: false,
          options: [
            { key: "kickoff", label: "Kickoff" },
            { key: "delivery", label: "Delivery" },
          ],
        },
      ],
      relationships: [],
      calculations: [],
    },
    listDefaults: [
      {
        list: "project",
        name: "Projects",
        layout: "board",
        groupBy: "project.phase",
        sort: null,
        columns: [],
        summaries: [],
      },
    ],
    sampleData: { lists: [{ list: "deal", count: 6, kinds: [] }] },
    dashboard: {
      widgets: [
        {
          key: "pipelineValue",
          title: "Pipeline value",
          list: "deal",
          aggregation: "count",
          valueField: null,
          groupBy: null,
          filters: [],
          display: "number",
        },
      ],
    },
    knowledgeBase: { pages: [{ key: "overview", kind: "overview", title: "Company overview", sections: ["About"] }] },
    importMapping: null,
  } as SetupPlan;
}

export function phaseView(
  key: WorkspaceSetupPhase,
  status: WorkspaceSetupPhaseView["status"] = "pending",
  error: WorkspaceSetupPhaseView["error"] = null,
): WorkspaceSetupPhaseView {
  return { key, status, error, attempts: status === "pending" ? 0 : 1, startedAt: null, finishedAt: null };
}

export function setupView(overrides: Partial<WorkspaceSetupView> = {}): WorkspaceSetupView {
  return {
    id: SETUP_ID,
    status: "interview",
    websiteUrl: "https://example.com/",
    startedAt: "2026-10-11T10:00:00.000Z",
    confirmedAt: null,
    finishedAt: null,
    knowledgeBase: { crawlStatus: null, failureReason: null, pagesPlanned: 0, pagesWritten: 0 },
    interview: {
      answers: {},
      prefill: "completed",
      prefillError: null,
      followUps: "idle",
      followUpQuestions: [],
      followUpAnswers: [],
    },
    plan: { status: "idle", error: null, revision: 0, plan: null },
    spreadsheet: null,
    phases: PHASES.map((key) => phaseView(key)),
    currentPhase: null,
    results: { colors: null, lists: [], views: [], records: [], widgets: [], pages: [] },
    spend: { usedMicrocents: 0, heldMicrocents: 0, capMicrocents: 1, capReached: false },
    ...overrides,
  };
}
