import { z } from "zod";
import { asSchema, tool, jsonSchema, type ToolSet } from "ai";

import { ALL_MCP_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";
import {
  executeMcpTool,
  expectedMcpToolFailure,
  validationError,
  type McpToolExecutionResult,
} from "@/features/mcp-tools/mcp-tool";
import { RequestSupportSchema } from "@/features/mcp-tools/support.mcp-tools";
import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";

import { isReadOnlyTool, requiresApproval } from "./gated-tools";
import { toAgentUiCommandInput } from "./agent-ui-command";
import { type AgentToolCancellation as AgentToolCancellationValue } from "./agent-tool-cancellation";
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
import { internalToolIdentity } from "./tool-identity";
import { providerWireInputSchema } from "./provider-safe-json-schema";
import type { AgentToolInputResult } from "./agent-tool-input";

export { isAgentToolCancellation, type AgentToolCancellation } from "./agent-tool-cancellation";

export type ApprovalDecision = "approve" | "reject" | "timeout";
export type AgentUiCommandOutcome = { ok: boolean; result: string };

export { AGENT_UI_TOOL_NAMES } from "./agent-ui-command";

const NON_TRANSACTIONAL_TOOL_GROUPS = ["messaging", "social", "support"] as const;

let nonTransactionalToolNames: ReadonlySet<string> | undefined;

export function hasNonTransactionalEffect(toolName: string) {
  nonTransactionalToolNames ??= new Set(
    NON_TRANSACTIONAL_TOOL_GROUPS.flatMap((group) => (MCP_TOOL_GROUPS?.[group] ?? []).map((mcp) => mcp.name)),
  );

  return nonTransactionalToolNames.has(toolName);
}

export type AgentToolDeps = {
  runUiCommand: (commandId: string, name: string, input: Record<string, unknown>) => Promise<AgentUiCommandOutcome>;
  requestApproval: (requestId: string, toolName: string, input: unknown) => Promise<ApprovalDecision>;
  resolveApprovalContext: (toolName: string, input: unknown) => Promise<AgentApprovalContextResolution>;
  createSupportTicket: (toolCallId: string, subject: string, body: string) => Promise<McpToolExecutionResult>;
  runExactlyOnce: <T>(toolCallId: string, toolName: string, run: () => Promise<T>) => Promise<T>;
  runInCallerContext: <T>(run: () => Promise<T>) => Promise<T>;
  resultMaxChars: number;
};

function withCallerContext(tools: ToolSet, deps: AgentToolDeps): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([name, agentTool]) => {
      const execute = (agentTool as { execute?: (...args: never[]) => Promise<unknown> }).execute;
      if (typeof execute !== "function") return [name, agentTool];

      return [
        name,
        {
          ...agentTool,
          execute: (...args: never[]) => deps.runInCallerContext(() => execute(...args)),
        },
      ];
    }),
  );
}

function declineResult(decision: Exclude<ApprovalDecision, "approve">): AgentToolCancellationValue {
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
): Promise<T | AgentToolCancellationValue> {
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

const PROVIDER_SAFE_FORMAT_PATTERNS: Record<string, string | undefined> = {
  email: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
  uri: "^[A-Za-z][A-Za-z0-9+.-]*:\\S*$",
};

function providerSafeSchema<TSchema extends z.ZodType>(inputSchema: TSchema) {
  return jsonSchema<z.infer<TSchema>>(
    z.toJSONSchema(inputSchema as never, {
      io: "input",
      target: "draft-07",
      override: (ctx) => {
        const schema = ctx.jsonSchema as { pattern?: string; format?: string };
        if (typeof schema.pattern === "string" && UNSUPPORTED_PATTERN.test(schema.pattern)) delete schema.pattern;

        const format = schema.format;
        delete schema.format;
        if (schema.pattern === undefined && format !== undefined) {
          const fallback = PROVIDER_SAFE_FORMAT_PATTERNS[format];
          if (fallback) schema.pattern = fallback;
        }
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

const NavigateSchema = z.object({ targetId: NavigationUiTargetIdSchema.describe("A routable target id.") });
const HighlightElementSchema = z.object({
  targetId: UiTargetIdSchema.describe("A target id from list_ui_targets."),
});
const ClickUiTargetSchema = z.object({
  targetId: ClickUiTargetIdSchema.describe("An activatable target id from list_ui_targets."),
});

const ListUiTargetsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Optional page names, routes, target prefixes, or exact target ids. Any word may match, so one query can cover several pages.",
    ),
  cursor: z.number().int().min(0).max(10_000).optional().describe("Continue a previous result page."),
});

function compactUiTarget(target: AgentUiTarget) {
  const actions = [...(target.route.startsWith("/") ? ["n"] : []), "h", ...(target.activation ? ["c"] : [])].join("");
  const prerequisite = target.activation?.kind === "selected" ? `|>${target.activation.prerequisite}` : "";
  return `${target.id}|${target.route}|${actions}${prerequisite}`;
}

function uiTargetQueryTokens(query: string | undefined) {
  return query?.toLocaleLowerCase().match(/[\p{L}\p{N}/-]{2,}/gu) ?? [];
}

function matchesUiTargetQuery(target: AgentUiTarget, tokens: string[]) {
  const haystack = `${target.id} ${target.route} ${target.description}`.toLocaleLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function listUiTargets(input: z.infer<typeof ListUiTargetsSchema>, resultMaxChars: number) {
  const tokens = uiTargetQueryTokens(input.query);
  const matched = tokens.length
    ? AGENT_UI_TARGETS.filter((target) => matchesUiTargetQuery(target, tokens))
    : AGENT_UI_TARGETS;
  const targets = matched.length > 0 ? matched : AGENT_UI_TARGETS;
  const cursor = Math.min(input.cursor ?? 0, targets.length);
  const header = "actions n=navigate,h=highlight,c=click; >target is a prerequisite\n";

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
    execute: async (input: unknown, { toolCallId }) => {
      const execute = async () => {
        const outcome = await executeMcpTool(mcp, [input]);
        return agentToolResult(outcome, deps.resultMaxChars);
      };
      const enrollable = !isReadOnlyTool(mcp) && !hasNonTransactionalEffect(mcp.name);
      const run = enrollable ? () => deps.runExactlyOnce(toolCallId, mcp.name, execute) : execute;
      return runSafely(async () => {
        if (!requiresApproval(internalToolIdentity(mcp.name), mcp, input)) return run();
        const approvalContext = await deps.resolveApprovalContext(mcp.name, input);
        if (!approvalContext.ok) return { ok: false, result: approvalContext.result };
        return runGated(deps, toolCallId, mcp.name, approvalContext.input, run);
      }, deps.resultMaxChars);
    },
  });
}

function panelInput(toolName: string, input: unknown): Record<string, unknown> {
  return toAgentUiCommandInput(toolName, input) ?? {};
}

function uiTools(deps: AgentToolDeps): ToolSet {
  const runUiCommand = async (toolCallId: string, name: string, input: Record<string, unknown>) => {
    const outcome = await deps.runUiCommand(toolCallId, name, input);
    return { ...outcome, result: outcome.result.slice(0, deps.resultMaxChars) };
  };

  return {
    list_ui_targets: tool({
      description:
        "List exact stable interface target ids before using an interface tool. Make one focused query with the workflow or page phrase and reuse every relevant id it returns instead of querying ids one by one. Results use action codes n=navigate, h=highlight, c=click and >target for a prerequisite; continue only when nextCursor is present.",
      inputSchema: providerSafeSchema(ListUiTargetsSchema),
      execute: (input) => listUiTargets(input, deps.resultMaxChars),
    }),
    navigate: tool({
      description: "Open an app destination by its target id from list_ui_targets.",
      inputSchema: providerSafeSchema(NavigateSchema),
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "navigate", panelInput("navigate", input)), deps.resultMaxChars),
    }),
    highlight_element: tool({
      description: "Spotlight a single interface target by its id (from list_ui_targets) on the current page.",
      inputSchema: providerSafeSchema(HighlightElementSchema),
      execute: (input, { toolCallId }) =>
        runSafely(
          () => runUiCommand(toolCallId, "highlight_element", panelInput("highlight_element", input)),
          deps.resultMaxChars,
        ),
    }),
    start_tour: tool({
      description:
        "Run a guided tour you compose for this user. Call list_ui_targets once, then choose the targets that answer what they asked to see and write your own note for each one. The tour navigates to each step itself, so do not call navigate first. Ask what they want to see when the request is vague; go straight to the tour when it is specific. Be thorough: walk the whole journey rather than naming each screen, and write every note in the user's language.",
      inputSchema: providerSafeSchema(AgentTourSchema),
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "start_tour", panelInput("start_tour", input)), deps.resultMaxChars),
    }),
    click_ui_target: tool({
      description:
        "Activate one reversible display control by its exact id from list_ui_targets. Navigate to the target first. Layout controls require opening the matching display-options target first. A successful result means the browser verified the control is expanded or selected.",
      inputSchema: providerSafeSchema(ClickUiTargetSchema),
      execute: (input, { toolCallId }) =>
        runSafely(
          () => runUiCommand(toolCallId, "click_ui_target", panelInput("click_ui_target", input)),
          deps.resultMaxChars,
        ),
    }),
    open_record: tool({
      description:
        "Open one record after finding its id with list_records or search_records. Use the drawer to keep context, the page for a full view, and recordId 'new' for a blank form the user fills in.",
      inputSchema: providerSafeSchema(OpenRecordSchema),
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "open_record", panelInput("open_record", input)), deps.resultMaxChars),
    }),
  };
}

export function getAgentAiTools(deps: AgentToolDeps): ToolSet {
  const crm = ALL_MCP_TOOLS.filter((mcp) => mcp.name !== "request_support").map(
    (mcp) => [mcp.name, crmTool(mcp, deps)] as const,
  );
  return withCallerContext(
    {
      ...Object.fromEntries(crm),
      ...uiTools(deps),
      request_support: tool({
        description:
          "Email a support request to the Customermates team. Use when the user asks for a human, reports a bug, or you cannot help after a genuine attempt. The recent Assistant conversation is included, and the team replies to the email address on the user's account.",
        inputSchema: providerSafeSchema(RequestSupportSchema),
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
    } as unknown as ToolSet,
    deps,
  );
}

export type AgentAiToolDefinition = {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
};

export function describeAgentAiTools(tools: ToolSet, servingProvider?: string): AgentAiToolDefinition[] {
  return Object.entries(tools).map(([name, agentTool]) => ({
    name,
    description:
      "description" in agentTool && typeof agentTool.description === "string" ? agentTool.description : undefined,
    inputSchema:
      "inputSchema" in agentTool
        ? providerWireInputSchema(asSchema(agentTool.inputSchema).jsonSchema, servingProvider)
        : undefined,
  }));
}

const TOOL_DEFINITION_DEPS: AgentToolDeps = {
  runUiCommand: () => Promise.resolve({ ok: false, result: "Definition-only tool." }),
  requestApproval: () => Promise.resolve("reject"),
  resolveApprovalContext: (_toolName, input) => Promise.resolve({ ok: true, input }),
  createSupportTicket: () => Promise.resolve({ ok: true, result: "Definition-only tool." }),
  runExactlyOnce: (_toolCallId, _toolName, run) => run(),
  runInCallerContext: (run) => run(),
  resultMaxChars: 1,
};

export function getAgentAiToolDefinitions(servingProvider?: string): AgentAiToolDefinition[] {
  return describeAgentAiTools(getAgentAiTools(TOOL_DEFINITION_DEPS), servingProvider);
}

export async function normalizeAgentAiToolInput(
  toolName: string,
  input: unknown,
  maxChars: number,
): Promise<AgentToolInputResult> {
  const tools = getAgentAiTools(TOOL_DEFINITION_DEPS);
  if (!Object.hasOwn(tools, toolName)) return { ok: false, result: "The requested tool is not available." };
  const agentTool = tools[toolName];
  const schema = asSchema(agentTool.inputSchema);
  if (!schema.validate) throw new Error("The agent tool has no authoritative input validator.");
  const result = await schema.validate(input);
  if (result.success) return { ok: true, input: result.value };

  return {
    ok: false,
    result:
      result.error instanceof z.ZodError
        ? validationError(result.error).slice(0, maxChars)
        : "The tool input does not match its required schema.",
  };
}
