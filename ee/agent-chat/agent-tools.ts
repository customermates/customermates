import { agentToolOutputContext } from "./agent-activity-context";
import { WIKI_SOURCE_RESULT_MAX_CHARS } from "@/ee/wiki-crawl/wiki-source-coverage";
import { z } from "zod";
import { asSchema, tool, jsonSchema, type ToolSet } from "ai";

import { ALL_MCP_TOOLS, MCP_ALWAYS_ON_TOOLS, MCP_TOOL_GROUPS } from "@/features/mcp-tools/tool-registry";
import { encodeToToon } from "@/features/mcp-tools/utils";
import { dataViewNavigationHref, entityTimelineNavigationHref } from "@/core/data-view/data-view-links";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { DATA_VIEW_PATHS } from "@/core/data-view/data-view-paths";
import { AiManageableDataViewSurfaceKeySchema } from "@/core/data-view/ai-manageable-surfaces";
import { ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import {
  executeMcpTool,
  expectedMcpToolFailure,
  validationError,
  type McpToolExecutionResult,
} from "@/features/mcp-tools/mcp-tool";
import { RequestSupportSchema } from "@/features/mcp-tools/support.mcp-tools";
import { getDocsPageTool, searchDocsTool } from "@/features/mcp-tools/docs.mcp-tools";
import { manageWikiPagesTool } from "@/features/mcp-tools/wiki.mcp-tools";
import { runWithSectionRanking } from "@/core/retrieval/retrieval-context";
import { redactUnexpectedError } from "@/core/errors/redact-unexpected-error";

import { agentToolResultText } from "./agent-budget-policy";
import { isReadOnlyTool, requiresApproval } from "./gated-tools";
import { AGENT_UI_TOOL_NAMES, toAgentUiCommandInput } from "./agent-ui-command";
import { isUnattendedSurface, type AgentSurface } from "./agent-surface-policy";
import { approvalDeclineResult } from "./agent-approval-resume";
import {
  AGENT_ON_DEMAND_TOOLSETS,
  AGENT_TOOLSET_SUMMARY,
  ANALYZE_RECORDS_TOOL_NAME,
  LOAD_TOOLSET_TOOL_NAME,
  isAgentOnDemandToolset,
} from "./agent-toolset-routing";
import { onDemandToolsetOfTool, toolNamesOfToolset } from "./agent-toolsets";
import { hostedToolInputGuard } from "./agent-hosted-guards";
import { APP_LOCALES, isContentLocale } from "@/i18n/locale-registry";
import { getTranslator } from "@/i18n/get-translator";
import { type AgentToolCancellation as AgentToolCancellationValue } from "./agent-tool-cancellation";
import {
  AGENT_UI_TARGETS,
  UiTargetIdSchema,
  agentUiPageLabelKeys,
  uiPrerequisiteRefusal,
  unopenedUiPrerequisite,
  type AgentUiTarget,
} from "./ui-targets";
import { AgentTourSchema } from "./agent-tours";
import { NavigateInputSchema } from "./ui-operations";
import type { AgentApprovalContextResolution } from "./agent-external-approval-context";
import { internalToolIdentity, WIKI_WEBSITE_IMPORT_TOOL_NAME } from "./tool-identity";
import { importWebsiteTool } from "@/ee/wiki-crawl/wiki-import-tool";
import { providerWireInputSchema } from "./provider-safe-json-schema";
import { ANALYZE_RECORDS_DESCRIPTION, AnalyzeRecordsSchema, analyzeRecords } from "./agent-analysis";
import { env } from "@/env";
import type { AgentToolInputResult } from "./agent-tool-input";
import { getAgentWebSearchTool } from "./agent-web-search";
import { hostedWorkspaceContextTool } from "@/features/mcp-tools/workspace.mcp-tools";
import { localizeWikiPageUrls } from "@/features/wiki/wiki-links";
import { agentViewToolMismatch } from "./agent-page-context";
import { hostedSectionRankers } from "./docs-rerank";
import {
  createWikiFromCrawlTool,
  readWebsiteSourceTool,
  WIKI_READ_SOURCE_TOOL_NAME,
} from "@/ee/wiki-crawl/wiki-crawl-synthesis-tools";

export type AgentToolOptions = {
  locale?: string;
  webSearchEnabled?: boolean;
  wikiHomepageSetup?: boolean;
  wikiCrawlId?: string | null;
  wikiWebsiteSetup?: boolean;
  surface?: AgentSurface;
};

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
  pageRoute?: string | null;
  latestUserMessage?: string | null;
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

async function runGated<T>(
  deps: AgentToolDeps,
  surface: AgentSurface | undefined,
  toolCallId: string,
  name: string,
  input: unknown,
  run: () => Promise<T>,
): Promise<T | AgentToolCancellationValue> {
  const decision = await deps.requestApproval(toolCallId, name, input);
  if (decision !== "approve") return approvalDeclineResult(decision, surface);
  return run();
}

function contextualAgentToolResultText(
  toolName: string | undefined,
  outcome: McpToolExecutionResult,
  pageRoute: string | null | undefined,
) {
  if (toolName !== "manage_data_views" || !outcome.ok || !outcome.structuredContent) return outcome.result;
  const content = outcome.structuredContent;
  if (content.surfaceKey !== SURFACE.entityTimeline || content.action === "delete") return outcome.result;

  const link = entityTimelineNavigationHref(pageRoute, content.viewKey);
  return link ? encodeToToon({ ...content, link }) : outcome.result;
}

function contextualAgentToolNavigation(
  toolName: string | undefined,
  outcome: McpToolExecutionResult,
  pageRoute: string | null | undefined,
) {
  if (toolName !== "manage_data_views" || !outcome.ok || !outcome.structuredContent) return null;
  const content = outcome.structuredContent;
  if (content.action !== "create" && content.action !== "update" && content.action !== "select") return null;
  const surfaceKey = AiManageableDataViewSurfaceKeySchema.safeParse(content.surfaceKey);
  const viewKey = ViewKeySchema.safeParse(content.viewKey);
  if (!surfaceKey.success || !viewKey.success) return null;
  const href =
    surfaceKey.data === SURFACE.entityTimeline
      ? content.link === null
        ? entityTimelineNavigationHref(pageRoute, viewKey.data)
        : null
      : content.link === `${DATA_VIEW_PATHS[surfaceKey.data]}?view=${viewKey.data}`
        ? dataViewNavigationHref(content.link)
        : null;
  return href ? { kind: "saved-view" as const, href } : null;
}

function agentToolResult(
  outcome: McpToolExecutionResult,
  maxChars: number,
  context: { toolName?: string; pageRoute?: string | null } = {},
) {
  const navigation = contextualAgentToolNavigation(context.toolName, outcome, context.pageRoute);
  const activityContext = outcome.ok ? agentToolOutputContext(context.toolName, outcome.structuredContent) : undefined;
  return {
    ok: outcome.ok,
    result: agentToolResultText(
      context.toolName === WIKI_READ_SOURCE_TOOL_NAME
        ? contextualAgentToolResultText(context.toolName, outcome, context.pageRoute)
        : localizeWikiPageUrls(
            contextualAgentToolResultText(context.toolName, outcome, context.pageRoute),
            env.BASE_URL,
          ),
      maxChars,
    ),
    ...(navigation ? { navigation } : {}),
    ...(activityContext ? { activityContext } : {}),
  };
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

export const AGENT_WIRE_UUID_PATTERN = "^[0-9a-fA-F-]{36}$";

const PROVIDER_SAFE_FORMAT_PATTERNS: Record<string, string | undefined> = {
  email: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
  uri: "^[A-Za-z][A-Za-z0-9+.-]*:\\S*$",
  uuid: AGENT_WIRE_UUID_PATTERN,
};

const CANONICAL_UUID_PATTERN_MARK = "[0-9a-fA-F]{8}-";

function providerSafeSchema<TSchema extends z.ZodType>(inputSchema: TSchema) {
  return jsonSchema<z.infer<TSchema>>(
    z.toJSONSchema(inputSchema as never, {
      io: "input",
      target: "draft-07",
      override: (ctx) => {
        const schema = ctx.jsonSchema as {
          pattern?: string;
          format?: string;
          const?: unknown;
          title?: unknown;
        };
        if (schema.const !== undefined && schema.title === String(schema.const)) delete schema.title;
        if (typeof schema.pattern === "string" && UNSUPPORTED_PATTERN.test(schema.pattern)) delete schema.pattern;
        if (typeof schema.pattern === "string" && schema.pattern.includes(CANONICAL_UUID_PATTERN_MARK))
          schema.pattern = AGENT_WIRE_UUID_PATTERN;

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

const HighlightElementSchema = z.object({
  targetId: UiTargetIdSchema.describe("A target id from list_ui_targets."),
});
const ListUiTargetsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Optional English page names, routes, target prefixes or exact ids; sidebar names, renamed record types included, also match in the app's languages. Any word may match, so one query can cover several pages; an exact id comes first, then the ids it prefixes.",
    ),
  cursor: z.number().int().min(0).max(10_000).optional().describe("Continue a previous result page."),
});

function compactUiTarget(target: AgentUiTarget) {
  const actions = [...(target.route.startsWith("/") ? ["n"] : []), "h"].join("");
  const prerequisite = target.prerequisite ? `|>${target.prerequisite}` : "";
  return `${target.id}|${target.route}|${actions}${prerequisite}`;
}

function uiTargetQueryTokens(query: string | undefined) {
  return query?.toLocaleLowerCase().match(/[\p{L}\p{N}/-]{2,}/gu) ?? [];
}

let uiTargetPageNames: Promise<Map<string, string>> | undefined;

function localizedUiTargetPageNames() {
  uiTargetPageNames ??= Promise.all(APP_LOCALES.map((locale) => getTranslator(locale))).then(
    (translators) =>
      new Map(
        AGENT_UI_TARGETS.map((target) => {
          const labelKeys = [...(target.labelKey ? [target.labelKey] : []), ...agentUiPageLabelKeys(target.route)];
          return [
            target.id,
            labelKeys
              .flatMap((labelKey) => translators.map((t) => t(labelKey)))
              .join("\n")
              .toLocaleLowerCase(),
          ];
        }),
      ),
  );
  return uiTargetPageNames;
}

function matchesUiTargetQuery(target: AgentUiTarget, tokens: string[], pageNames: Map<string, string>) {
  const haystack =
    `${target.id} ${target.route} ${target.description} ${pageNames.get(target.id) ?? ""}`.toLocaleLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function uiTargetPrefixes(limit: number): string[] {
  const counts = new Map<string, number>();
  for (const target of AGENT_UI_TARGETS) {
    const prefix = target.id.split("-")[0] ?? target.id;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return [...counts.entries()]
    .toSorted((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .slice(0, limit)
    .map(([prefix]) => `${prefix}-`);
}

const UI_TARGET_QUERY_WORD_MIN_LENGTH = 4;

async function matchingUiTargets(query: string | undefined) {
  const tokens: string[] = uiTargetQueryTokens(query);
  if (!tokens.length) return AGENT_UI_TARGETS;
  const pageNames = await localizedUiTargetPageNames();
  const phrase = query?.trim().toLocaleLowerCase().replace(/\s+/g, " ") ?? "";
  const words = tokens.filter((token) => token.length >= UI_TARGET_QUERY_WORD_MIN_LENGTH);
  const phraseMatches = phrase.includes(" ")
    ? AGENT_UI_TARGETS.filter((target) => pageNames.get(target.id)?.includes(phrase))
    : [];
  const wordMatches = AGENT_UI_TARGETS.filter((target) => matchesUiTargetQuery(target, words, pageNames));
  const matches = phraseMatches.length
    ? phraseMatches
    : wordMatches.length
      ? wordMatches
      : AGENT_UI_TARGETS.filter((target) => matchesUiTargetQuery(target, tokens, pageNames));
  const exact = matches.filter((target) => tokens.includes(target.id));
  return [...exact, ...matches.filter((target) => !exact.includes(target))];
}

async function listUiTargets(input: z.infer<typeof ListUiTargetsSchema>, resultMaxChars: number) {
  const targets = await matchingUiTargets(input.query);
  if (targets.length === 0) {
    return `No interface target matches "${input.query ?? ""}". Target names are English: query with the English page or workflow phrase (for example "deals", "inbox", "settings"), or with one of these id prefixes: ${uiTargetPrefixes(10).join(", ")}.`.slice(
      0,
      resultMaxChars,
    );
  }
  const cursor = Math.min(input.cursor ?? 0, targets.length);
  const header =
    "actions n=navigate,h=highlight; >X is what the user must open first: a target id or a named row or card\n";

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

const SECTION_RANKED_TOOLS = new Set([searchDocsTool.name, getDocsPageTool.name, manageWikiPagesTool.name]);

function hostedMcpTool(mcp: (typeof ALL_MCP_TOOLS)[number], deps: AgentToolDeps): (typeof ALL_MCP_TOOLS)[number] {
  if (!SECTION_RANKED_TOOLS.has(mcp.name)) return mcp;
  const rankers = hostedSectionRankers(deps.latestUserMessage ?? null);
  if (!rankers) return mcp;
  const execute = mcp.execute as (...args: unknown[]) => ReturnType<typeof mcp.execute>;
  return {
    ...mcp,
    execute: (...args: never[]) => runWithSectionRanking(rankers, () => execute(...args)),
  };
}

function crmTool(mcp: (typeof ALL_MCP_TOOLS)[number], deps: AgentToolDeps, surface: AgentSurface | undefined) {
  const resultMaxChars = mcp.name === WIKI_READ_SOURCE_TOOL_NAME ? WIKI_SOURCE_RESULT_MAX_CHARS : deps.resultMaxChars;
  return tool({
    description: mcp.description,
    inputSchema: providerSafeSchema(mcp.inputSchema),
    execute: async (input: unknown, { toolCallId }) => {
      const execute = async () => {
        const outcome = await executeMcpTool(hostedMcpTool(mcp, deps), [input]);
        return agentToolResult(outcome, resultMaxChars, {
          toolName: mcp.name,
          pageRoute: deps.pageRoute,
        });
      };
      const enrollable =
        mcp.name === WIKI_READ_SOURCE_TOOL_NAME || (!isReadOnlyTool(mcp) && !hasNonTransactionalEffect(mcp.name));
      const run = enrollable ? () => deps.runExactlyOnce(toolCallId, mcp.name, execute) : execute;
      return runSafely(async () => {
        const mismatch = agentViewToolMismatch(deps.pageRoute, mcp.name, input);
        if (mismatch) return { ok: false, result: mismatch };
        const approvalContext = await deps.resolveApprovalContext(mcp.name, input);
        if (!approvalContext.ok) return { ok: false, result: approvalContext.result };
        if (!requiresApproval(internalToolIdentity(mcp.name), mcp, approvalContext.input)) return run();
        return runGated(deps, surface, toolCallId, mcp.name, approvalContext.input, run);
      }, resultMaxChars);
    },
  });
}

function panelInput(toolName: string, input: unknown): Record<string, unknown> {
  return toAgentUiCommandInput(toolName, input) ?? {};
}

function uiTools(deps: AgentToolDeps): ToolSet {
  const runUiCommand = async (toolCallId: string, name: string, input: Record<string, unknown>) => {
    const outcome = await deps.runUiCommand(toolCallId, name, input);
    return {
      ...outcome,
      result: agentToolResultText(outcome.result, deps.resultMaxChars),
    };
  };

  return {
    list_ui_targets: tool({
      description:
        "List exact stable interface target ids before using an interface tool. Make one focused query with the workflow or page phrase and reuse every relevant id it returns. Results use action codes n=navigate and h=highlight; >X is what the user must open first: a target id or a named row or card. Continue only when nextCursor is present.",
      inputSchema: providerSafeSchema(ListUiTargetsSchema),
      execute: (input) => listUiTargets(input, deps.resultMaxChars),
    }),
    navigate: tool({
      description:
        "Open an app area by its target id from list_ui_targets, or open one existing record's page by passing entity and recordId after list_records or search_records found the id. Records always open on their page, never in the drawer; to add a record, highlight the matching add control instead.",
      inputSchema: providerSafeSchema(NavigateInputSchema),
      execute: (input, { toolCallId }) =>
        runSafely(() => runUiCommand(toolCallId, "navigate", panelInput("navigate", input)), deps.resultMaxChars),
    }),
    highlight_element: tool({
      description:
        "Spotlight a single interface target by its id (from list_ui_targets) on the current page. A target listed with >X, where X is a target id, sits inside X: highlight X first, or run start_tour with X before it; a direct highlight of it is refused.",
      inputSchema: providerSafeSchema(HighlightElementSchema),
      execute: async (input, { toolCallId }) => {
        const prerequisite = unopenedUiPrerequisite(input.targetId);
        if (prerequisite) {
          return {
            ok: false,
            result: uiPrerequisiteRefusal(input.targetId, prerequisite),
          };
        }
        return runSafely(
          () => runUiCommand(toolCallId, "highlight_element", panelInput("highlight_element", input)),
          deps.resultMaxChars,
        );
      },
    }),
    start_tour: tool({
      description:
        "Run a guided tour you compose for this user. Call list_ui_targets once, then choose the targets that answer what they asked to see and write your own note for each one. The tour navigates to each step itself, so do not call navigate first. Ask what they want to see when the request is vague; go straight to the tour when it is specific. Be thorough: walk the whole journey rather than naming each screen, and write every note in the user's language.",
      inputSchema: providerSafeSchema(AgentTourSchema),
      execute: async (input, { toolCallId }) => {
        const targets = input.steps.map((step) => step.targetId);
        for (const [index, targetId] of targets.entries()) {
          const prerequisite = unopenedUiPrerequisite(targetId, targets.slice(0, index));
          if (prerequisite) {
            return {
              ok: false,
              result: uiPrerequisiteRefusal(targetId, prerequisite),
            };
          }
        }
        return runSafely(
          () => runUiCommand(toolCallId, "start_tour", panelInput("start_tour", input)),
          deps.resultMaxChars,
        );
      },
    }),
  };
}

function isDeepResearchTool(name: string) {
  return MCP_ALWAYS_ON_TOOLS.some((mcp) => mcp.name === name);
}

const LoadToolsetSchema = z.object({
  toolset: z.enum(AGENT_ON_DEMAND_TOOLSETS).describe("The set to load; the tool description says what each set covers"),
});

function analyzeRecordsTool(deps: AgentToolDeps) {
  return tool({
    description: ANALYZE_RECORDS_DESCRIPTION,
    inputSchema: providerSafeSchema(AnalyzeRecordsSchema),
    execute: (input) =>
      runSafely(
        () =>
          analyzeRecords(input, {
            tools: hostedMcpTools(),
            resultMaxChars: deps.resultMaxChars,
          }).then((outcome) => ({
            ok: outcome.ok,
            result: agentToolResultText(outcome.result, deps.resultMaxChars),
          })),
        deps.resultMaxChars,
      ),
  });
}

export const AGENT_HOSTED_TOOL_ANNOTATIONS: Readonly<Record<string, Record<string, boolean>>> = {
  [ANALYZE_RECORDS_TOOL_NAME]: {
    readOnlyHint: true,
    idempotentHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
};

function loadToolsetTool() {
  return tool({
    description:
      "Add an on-demand tool set to this turn when the request needs tools that are not in your current list. Sets: " +
      AGENT_ON_DEMAND_TOOLSETS.map((toolset) => `${toolset} (${AGENT_TOOLSET_SUMMARY[toolset]})`).join(", ") +
      ". A loaded set stays available for the rest of the turn; call its tools directly afterwards.",
    inputSchema: providerSafeSchema(LoadToolsetSchema),
    execute: (input) => ({
      ok: true,
      result: `Loaded ${input.toolset}: ${toolNamesOfToolset(input.toolset).join(", ")}. Call these tools directly now.`,
    }),
  });
}

export function hostedMcpTools() {
  return ALL_MCP_TOOLS.filter((mcp) => mcp.name !== "request_support" && !isDeepResearchTool(mcp.name)).map((mcp) =>
    mcp.name === "get_workspace_context" ? hostedWorkspaceContextTool() : mcp,
  );
}

export function isWikiWebsiteSetupTurn(
  options: Pick<AgentToolOptions, "wikiHomepageSetup" | "wikiWebsiteSetup" | "surface">,
) {
  return Boolean(options.wikiWebsiteSetup && !options.wikiHomepageSetup && options.surface === "chat");
}

function wikiWebsiteSetupTools(deps: AgentToolDeps, options: AgentToolOptions): ToolSet {
  return {
    [WIKI_WEBSITE_IMPORT_TOOL_NAME]: crmTool(importWebsiteTool(options.locale), deps, options.surface),
  };
}

export function getAgentAiTools(deps: AgentToolDeps, options: AgentToolOptions = {}): ToolSet {
  if (options.wikiHomepageSetup) {
    if (!options.wikiCrawlId) return {};
    return withCallerContext(
      {
        [WIKI_READ_SOURCE_TOOL_NAME]: crmTool(readWebsiteSourceTool(options.wikiCrawlId), deps, options.surface),
        manage_wiki_pages: crmTool(createWikiFromCrawlTool(options.locale, options.wikiCrawlId), deps, options.surface),
      },
      deps,
    );
  }
  const crm = hostedMcpTools().map((mcp) => [mcp.name, crmTool(mcp, deps, options.surface)] as const);
  return withCallerContext(
    {
      ...Object.fromEntries(crm),
      ...(options.surface === "routine" ? {} : uiTools(deps)),
      [LOAD_TOOLSET_TOOL_NAME]: loadToolsetTool(),
      ...(env.AGENT_ANALYSIS_TOOL_ENABLED ? { [ANALYZE_RECORDS_TOOL_NAME]: analyzeRecordsTool(deps) } : {}),
      ...(options.webSearchEnabled ? { web_search: getAgentWebSearchTool() } : {}),
      ...(isWikiWebsiteSetupTurn(options) ? wikiWebsiteSetupTools(deps, options) : {}),
      request_support: tool({
        description:
          "Email a support request to the Customermates team. Use when the user asks for a human, reports a bug, or you cannot help after a genuine attempt. The recent Assistant conversation is included, and the team replies to the email address on the user's account.",
        inputSchema: providerSafeSchema(RequestSupportSchema),
        execute: async (input, { toolCallId }) =>
          runSafely(
            () =>
              runGated(deps, options.surface, toolCallId, "request_support", input, () =>
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
  type?: "provider";
  isProviderExecuted?: boolean;
  supportsDeferredResults?: boolean;
  id?: string;
  args?: Record<string, unknown>;
  description: string | undefined;
  inputSchema: unknown;
};

export function describeAgentAiTools(tools: ToolSet, servingProvider?: string): AgentAiToolDefinition[] {
  return Object.entries(tools).map(([name, agentTool]) => ({
    name,
    ...(agentTool.type === "provider"
      ? {
          type: "provider" as const,
          id: agentTool.id,
          args: agentTool.args,
          isProviderExecuted: agentTool.isProviderExecuted,
          supportsDeferredResults: agentTool.supportsDeferredResults,
        }
      : {}),
    description:
      "description" in agentTool && typeof agentTool.description === "string" ? agentTool.description : undefined,
    inputSchema:
      "inputSchema" in agentTool
        ? providerWireInputSchema(asSchema(agentTool.inputSchema).jsonSchema, servingProvider, name)
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

export function getAgentAiToolDefinitions(
  servingProvider?: string,
  options: AgentToolOptions = {},
): AgentAiToolDefinition[] {
  return describeAgentAiTools(getAgentAiTools(TOOL_DEFINITION_DEPS, options), servingProvider);
}

export type AgentTurnToolDefinition = AgentAiToolDefinition & {
  toolset: string | null;
};

export function agentToolDefinitionsForTurn(args: {
  servingProvider: string;
  surface: AgentSurface;
  locale?: string;
  webSearchEnabled?: boolean;
  wikiHomepageSetup?: boolean;
  wikiCrawlId?: string | null;
  wikiWebsiteSetup?: boolean;
}): AgentTurnToolDefinition[] {
  const panelToolNames = new Set<string>(AGENT_UI_TOOL_NAMES);
  const unattended = isUnattendedSurface(args.surface);
  return getAgentAiToolDefinitions(args.servingProvider, args)
    .filter((definition) => !unattended || !panelToolNames.has(definition.name))
    .map((definition) => ({
      ...definition,
      toolset: onDemandToolsetOfTool(definition.name),
    }));
}

export function agentToolDefinitionsForToolsets(
  definitions: readonly AgentTurnToolDefinition[],
  toolsets: readonly string[],
): AgentTurnToolDefinition[] {
  const active = new Set(toolsets.filter(isAgentOnDemandToolset));
  return definitions.filter((definition) => definition.toolset === null || active.has(definition.toolset as never));
}

const DOCS_TOOL_NAMES = new Set(["search_docs", "get_docs_page"]);

export function withTurnLocale(toolName: string, input: unknown, locale: string | undefined): unknown {
  if (!DOCS_TOOL_NAMES.has(toolName) || !isContentLocale(locale)) return input;
  const record =
    input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  if (!record || record.locale !== undefined) return input;
  return { ...record, locale };
}

export async function normalizeAgentAiToolInput(
  toolName: string,
  input: unknown,
  maxChars: number,
  options: AgentToolOptions & {
    locale?: string;
    pageRoute?: string | null;
  } = {},
): Promise<AgentToolInputResult> {
  const tools = getAgentAiTools(TOOL_DEFINITION_DEPS, options);
  if (!Object.hasOwn(tools, toolName)) return { ok: false, result: "The requested tool is not available." };
  const agentTool = tools[toolName];
  const schema = asSchema(agentTool.inputSchema);
  if (!schema.validate) throw new Error("The agent tool has no authoritative input validator.");
  const result = await schema.validate(withTurnLocale(toolName, input, options.locale));
  if (result.success) {
    const guard = hostedToolInputGuard(toolName, result.value);
    if (guard) return { ok: false, result: guard };
    const mismatch = agentViewToolMismatch(options.pageRoute, toolName, result.value);
    return mismatch
      ? { ok: false, result: agentToolResultText(mismatch, maxChars) }
      : { ok: true, input: result.value };
  }

  return {
    ok: false,
    result:
      result.error instanceof z.ZodError
        ? agentToolResultText(validationError(result.error), maxChars)
        : "The tool input does not match its required schema.",
  };
}
