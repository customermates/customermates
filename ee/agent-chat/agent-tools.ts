import { z } from "zod";
import { asSchema, tool, jsonSchema, type ToolSet } from "ai";

import { ALL_MCP_TOOLS, MCP_ALWAYS_ON_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";
import { executeMcpTool, expectedMcpToolFailure, type McpToolExecutionResult } from "@/features/mcp-tools/mcp-tool";
import { RequestSupportSchema } from "@/features/mcp-tools/support.mcp-tools";
import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";

import { requiresApproval } from "./gated-tools";
import {
  AGENT_UI_TARGETS,
  ClickUiTargetIdSchema,
  NavigationUiTargetIdSchema,
  UiTargetIdSchema,
  type AgentUiTarget,
} from "./ui-targets";
import { AgentTourSchema } from "./agent-tours";
import { OpenRecordSchema } from "./ui-operations";
import type { AgentApprovalContextResolution } from "./agent-external-approval-context";
import { AGENT_TOOL_SEARCH_NAME, laneToolSearch } from "./llm.service";

export type ApprovalDecision = "approve" | "reject" | "timeout";
export type AgentUiCommandOutcome = { ok: boolean; result: string };

export type AgentToolCancellation = {
  agentToolStatus: "cancelled";
  reason: "rejected" | "timeout";
  message: string;
};

export function isAgentToolCancellation(value: unknown): value is AgentToolCancellation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<AgentToolCancellation>;
  return (
    result.agentToolStatus === "cancelled" &&
    (result.reason === "rejected" || result.reason === "timeout") &&
    typeof result.message === "string"
  );
}

export const AGENT_UI_TOOL_NAMES = [
  "list_ui_targets",
  "navigate",
  "highlight_element",
  "start_tour",
  "click_ui_target",
  "open_record",
] as const;

export const AGENT_TOOL_NAMESPACES = {
  record_reads: {
    name: "record_reads",
    description: "Read and search CRM records and inspect their schemas.",
  },
  customer_records: {
    name: "customer_records",
    description: "Create and update contacts and organizations.",
  },
  work_records: {
    name: "work_records",
    description: "Create and update deals, services, and tasks.",
  },
  record_details: {
    name: "record_details",
    description: "Manage CRM record notes and links, or delete records.",
  },
  workspace: {
    name: "workspace",
    description: "Workspace context, users, settings, team, fields, widgets, and webhooks.",
  },
  messaging: {
    name: "messaging",
    description: "Inbox, email and chat, drafts, activities, calendars, and account connections.",
  },
  social_sales: {
    name: "social_sales",
    description: "Connected social profiles, posts, relations, and Sales Navigator.",
  },
  research: {
    name: "research",
    description: "Search and read Customermates documentation and local CRM research results.",
  },
  interface: {
    name: "interface",
    description: "Navigate, highlight, tour, activate safe display controls, and open records.",
  },
  support: {
    name: "support",
    description: "Escalate a confirmed support request to the Customermates team.",
  },
  general: {
    name: "general",
    description: "Other Customermates workspace capabilities.",
  },
} as const;

export type AgentToolNamespace = (typeof AGENT_TOOL_NAMESPACES)[keyof typeof AGENT_TOOL_NAMESPACES];

const RECORD_READ_TOOL_NAMES = new Set(["get_record_schema", "list_records", "search_records", "get_records"]);
const CUSTOMER_RECORD_TOOL_NAMES = new Set([
  "create_contacts",
  "update_contacts",
  "create_organizations",
  "update_organizations",
]);
const WORK_RECORD_TOOL_NAMES = new Set([
  "create_deals",
  "update_deals",
  "create_services",
  "update_services",
  "create_tasks",
  "update_tasks",
]);
let mcpGroupByToolName: Map<string, string> | undefined;

function resolveMcpGroup(toolName: string) {
  mcpGroupByToolName ??= new Map(
    Object.entries(MCP_TOOL_GROUPS).flatMap(([group, tools]) =>
      tools.map((agentTool) => [agentTool.name, group] as const),
    ),
  );
  return mcpGroupByToolName.get(toolName);
}

export function agentToolNamespace(toolName: string): AgentToolNamespace {
  if ((AGENT_UI_TOOL_NAMES as readonly string[]).includes(toolName)) return AGENT_TOOL_NAMESPACES.interface;
  if (toolName === "request_support") return AGENT_TOOL_NAMESPACES.support;
  if (MCP_ALWAYS_ON_TOOLS.some((agentTool) => agentTool.name === toolName)) return AGENT_TOOL_NAMESPACES.research;

  const group = resolveMcpGroup(toolName);
  if (group === "records") {
    if (RECORD_READ_TOOL_NAMES.has(toolName)) return AGENT_TOOL_NAMESPACES.record_reads;
    if (CUSTOMER_RECORD_TOOL_NAMES.has(toolName)) return AGENT_TOOL_NAMESPACES.customer_records;
    if (WORK_RECORD_TOOL_NAMES.has(toolName)) return AGENT_TOOL_NAMESPACES.work_records;
    return AGENT_TOOL_NAMESPACES.record_details;
  }
  if (group === "docs") return AGENT_TOOL_NAMESPACES.research;
  if (["workspace", "custom-columns", "widgets", "webhooks", "admin"].includes(group ?? ""))
    return AGENT_TOOL_NAMESPACES.workspace;
  if (group === "messaging") return AGENT_TOOL_NAMESPACES.messaging;
  if (group === "social") return AGENT_TOOL_NAMESPACES.social_sales;
  if (group === "support") return AGENT_TOOL_NAMESPACES.support;
  return AGENT_TOOL_NAMESPACES.general;
}

function deferredProviderOptions(namespace: AgentToolNamespace) {
  return { openai: { deferLoading: true, namespace } } as const;
}

export type AgentToolDeps = {
  runUiCommand: (commandId: string, name: string, input: Record<string, unknown>) => Promise<AgentUiCommandOutcome>;
  requestApproval: (requestId: string, toolName: string, input: unknown) => Promise<ApprovalDecision>;
  resolveApprovalContext: (toolName: string, input: unknown) => Promise<AgentApprovalContextResolution>;
  createSupportTicket: (toolCallId: string, subject: string, body: string) => Promise<McpToolExecutionResult>;
  resultMaxChars: number;
};

function declineResult(decision: Exclude<ApprovalDecision, "approve">): AgentToolCancellation {
  return {
    agentToolStatus: "cancelled",
    reason: decision === "reject" ? "rejected" : "timeout",
    message:
      decision === "reject"
        ? "The user declined this action, so nothing was changed. Ask what they would like to do instead."
        : "The approval request timed out, so nothing was changed.",
  };
}

async function runGated<T>(
  deps: AgentToolDeps,
  toolCallId: string,
  name: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T | AgentToolCancellation> {
  const decision = await deps.requestApproval(toolCallId, name, input);
  if (decision !== "approve") return declineResult(decision);
  return run();
}

function agentToolResult(outcome: McpToolExecutionResult, maxChars: number) {
  return { ok: outcome.ok, result: outcome.result.slice(0, maxChars) };
}

async function runSafely<T>(
  run: () => Promise<T> | T,
  maxChars: number,
): Promise<T | ReturnType<typeof agentToolResult>> {
  try {
    return await run();
  } catch (error) {
    const expected = await expectedMcpToolFailure(error);
    if (expected) return agentToolResult(expected, maxChars);
    throw redactUnexpectedError(error, "The assistant tool could not be completed.");
  }
}

const UNSUPPORTED_PATTERN = /\(\?=|\(\?!|\(\?<=|\(\?<!/;

function providerSafeSchema(inputSchema: (typeof ALL_MCP_TOOLS)[number]["inputSchema"]) {
  return jsonSchema(
    z.toJSONSchema(inputSchema as never, {
      io: "input",
      override: (ctx) => {
        const schema = ctx.jsonSchema as { pattern?: string };
        if (typeof schema.pattern === "string" && UNSUPPORTED_PATTERN.test(schema.pattern)) delete schema.pattern;
      },
    }) as never,
    {
      validate: async (value) => {
        const result = await inputSchema.safeParseAsync(value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      },
    },
  );
}

const ListUiTargetsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Optional page name, route, target prefix, or exact target id used to narrow the catalog."),
  cursor: z.number().int().min(0).max(10_000).optional().describe("Continue a previous result page."),
});

function compactUiTarget(target: AgentUiTarget) {
  const actions = [...(target.route.startsWith("/") ? ["n"] : []), "h", ...(target.activation ? ["c"] : [])].join("");
  const prerequisite = target.activation?.kind === "selected" ? `|>${target.activation.prerequisite}` : "";
  return `${target.id}|${target.route}|${actions}${prerequisite}`;
}

function listUiTargets(input: z.infer<typeof ListUiTargetsSchema>, resultMaxChars: number) {
  const query = input.query?.toLocaleLowerCase();
  const targets = query
    ? AGENT_UI_TARGETS.filter((target) =>
        `${target.id} ${target.route} ${target.description}`.toLocaleLowerCase().includes(query),
      )
    : AGENT_UI_TARGETS;
  const cursor = Math.min(input.cursor ?? 0, targets.length);
  const header = "actions n=navigate,h=highlight,c=click; >target is a prerequisite\n";
  if (targets.length === 0) return `No interface targets match ${input.query}.`.slice(0, resultMaxChars);

  const lines: string[] = [];
  let nextCursor = cursor;
  while (nextCursor < targets.length) {
    const line = compactUiTarget(targets[nextCursor]);
    const candidateNext = nextCursor + 1;
    const footer = candidateNext < targets.length ? `\nnextCursor=${candidateNext};total=${targets.length}` : "\nend";
    const candidate = `${header}${[...lines, line].join("\n")}${footer}`;
    if (candidate.length > resultMaxChars) break;
    lines.push(line);
    nextCursor = candidateNext;
  }

  if (lines.length === 0)
    return `The target page is too large for this turn. Retry with its exact id as query.`.slice(0, resultMaxChars);

  const footer = nextCursor < targets.length ? `nextCursor=${nextCursor};total=${targets.length}` : "end";
  return `${header}${lines.join("\n")}\n${footer}`;
}

function crmTool(mcp: (typeof ALL_MCP_TOOLS)[number], deps: AgentToolDeps) {
  return tool({
    description: mcp.description,
    inputSchema: providerSafeSchema(mcp.inputSchema),
    providerOptions: deferredProviderOptions(agentToolNamespace(mcp.name)),
    execute: async (input: unknown, { toolCallId }) => {
      const run = async () => {
        const outcome = await executeMcpTool(mcp, [input]);
        return agentToolResult(outcome, deps.resultMaxChars);
      };
      return runSafely(async () => {
        if (!requiresApproval(mcp, input)) return run();
        const approvalContext = await deps.resolveApprovalContext(mcp.name, input);
        if (!approvalContext.ok) return { ok: false, result: approvalContext.result };
        return runGated(deps, toolCallId, mcp.name, approvalContext.input, run);
      }, deps.resultMaxChars);
    },
  });
}

function uiTools(deps: AgentToolDeps): ToolSet {
  const providerOptions = deferredProviderOptions(AGENT_TOOL_NAMESPACES.interface);
  const runUiCommand = async (toolCallId: string, name: string, input: Record<string, unknown>) => {
    const outcome = await deps.runUiCommand(toolCallId, name, input);
    return { ...outcome, result: outcome.result.slice(0, deps.resultMaxChars) };
  };

  return {
    list_ui_targets: tool({
      description:
        "List exact stable interface target ids before using an interface tool. Make one focused query with the workflow or page phrase and reuse every relevant id it returns instead of querying ids one by one. Results use action codes n=navigate, h=highlight, c=click and >target for a prerequisite; continue only when nextCursor is present.",
      inputSchema: ListUiTargetsSchema,
      providerOptions,
      execute: (input) => listUiTargets(input, deps.resultMaxChars),
    }),
    navigate: tool({
      description: "Open an app destination by its target id from list_ui_targets.",
      inputSchema: z.object({
        targetId: NavigationUiTargetIdSchema.describe("A routable target id."),
      }),
      providerOptions,
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "navigate", { targetId: input.targetId }), deps.resultMaxChars),
    }),
    highlight_element: tool({
      description: "Spotlight a single interface target by its id (from list_ui_targets) on the current page.",
      inputSchema: z.object({
        targetId: UiTargetIdSchema.describe("A target id from list_ui_targets."),
      }),
      providerOptions,
      execute: (input, { toolCallId }) =>
        runSafely(
          () =>
            runUiCommand(toolCallId, "highlight_element", {
              targetId: input.targetId,
            }),
          deps.resultMaxChars,
        ),
    }),
    start_tour: tool({
      description:
        "Run a guided tour you compose for this user. Call list_ui_targets once, then choose the targets that answer what they asked to see and write your own note for each one. The tour navigates to each step itself, so do not call navigate first. Ask what they want to see when the request is vague; go straight to the tour when it is specific. Be thorough: walk the whole journey rather than naming each screen, and write every note in the user's language.",
      inputSchema: AgentTourSchema,
      providerOptions,
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "start_tour", { steps: input.steps }), deps.resultMaxChars),
    }),
    click_ui_target: tool({
      description:
        "Activate one reversible display control by its exact id from list_ui_targets. Navigate to the target first. Layout controls require opening the matching display-options target first. A successful result means the browser verified the control is expanded or selected.",
      inputSchema: z.object({
        targetId: ClickUiTargetIdSchema.describe("An activatable target id from list_ui_targets."),
      }),
      providerOptions,
      execute: (input, { toolCallId }) =>
        runSafely(
          () =>
            runUiCommand(toolCallId, "click_ui_target", {
              targetId: input.targetId,
            }),
          deps.resultMaxChars,
        ),
    }),
    open_record: tool({
      description:
        "Open one record after finding its id with list_records or search_records. Use the drawer to keep context, the page for a full view, and recordId 'new' for a blank form the user fills in.",
      inputSchema: OpenRecordSchema,
      providerOptions,
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "open_record", input), deps.resultMaxChars),
    }),
  };
}

export function getAgentAiTools(deps: AgentToolDeps): ToolSet {
  const crm = ALL_MCP_TOOLS.filter((mcp) => mcp.name !== "request_support").map(
    (mcp) => [mcp.name, crmTool(mcp, deps)] as const,
  );
  const providerOptions = deferredProviderOptions(AGENT_TOOL_NAMESPACES.support);

  return {
    [AGENT_TOOL_SEARCH_NAME]: laneToolSearch(),
    ...Object.fromEntries(crm),
    ...uiTools(deps),
    request_support: tool({
      description:
        "Email a support request to the Customermates team. Use when the user asks for a human, reports a bug, or you cannot help after a genuine attempt. The recent Assistant conversation is included, and the team replies to the email address on the user's account.",
      inputSchema: RequestSupportSchema,
      providerOptions,
      execute: async (input, { toolCallId }) =>
        runSafely(
          () =>
            runGated(deps, toolCallId, "request_support", input, () =>
              deps
                .createSupportTicket(toolCallId, input.subject, input.body)
                .then((outcome) => agentToolResult(outcome, deps.resultMaxChars)),
            ),
          deps.resultMaxChars,
        ),
    }),
  } as unknown as ToolSet;
}

export type AgentAiToolDefinition = {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
};

export function describeAgentAiTools(tools: ToolSet): AgentAiToolDefinition[] {
  return Object.entries(tools).map(([name, agentTool]) => ({
    name,
    description:
      "description" in agentTool && typeof agentTool.description === "string" ? agentTool.description : undefined,
    inputSchema: "inputSchema" in agentTool ? asSchema(agentTool.inputSchema).jsonSchema : undefined,
  }));
}

const TOOL_DEFINITION_DEPS: AgentToolDeps = {
  runUiCommand: () => Promise.resolve({ ok: false, result: "Definition-only tool." }),
  requestApproval: () => Promise.resolve("reject"),
  resolveApprovalContext: (_toolName, input) => Promise.resolve({ ok: true, input }),
  createSupportTicket: () => Promise.resolve({ ok: true, result: "Definition-only tool." }),
  resultMaxChars: 1,
};

export function getAgentAiToolDefinitions(): AgentAiToolDefinition[] {
  return describeAgentAiTools(getAgentAiTools(TOOL_DEFINITION_DEPS));
}
