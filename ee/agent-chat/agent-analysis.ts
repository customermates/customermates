import { z } from "zod";

import { executeMcpTool, validationError, type McpTool } from "@/features/mcp-tools/mcp-tool";

import { runAnalysisCode, type AnalysisLimits } from "./agent-analysis-isolate";
import { isReadOnlyTool } from "./gated-tools";

export const ANALYSIS_MAX_ROWS = 10_000;
export const ANALYSIS_MAX_BYTES = 8 * 1024 * 1024;
const ANALYSIS_PAGE_SIZE = 100;

export const AnalyzeRecordsSchema = z.object({
  reads: z
    .array(
      z.object({
        tool: z.string().min(1).describe("A read-only tool, for example list_records or get_messaging_threads"),
        input: z
          .union([z.record(z.string(), z.unknown()), z.string()])
          .optional()
          .describe(
            'That tool\'s input as a JSON object (a JSON string is also accepted), for example {"entity":"deal","filters":[{"field":"name","operator":"startsWith","value":"Atlas-"}]}. Paging is handled for you: omit page and pageSize.',
          ),
      }),
    )
    .min(1)
    .max(10)
    .describe("One to ten reads, run in order before the code; data[i] is the full result of reads[i]"),
  code: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      "A JavaScript function expression (data) => result. It may be async, but there is nothing to await: tools cannot be called from the code, so every read goes in reads. It runs with no network or clock, and must return JSON-serializable data.",
    ),
});

export type AnalyzeRecordsInput = z.infer<typeof AnalyzeRecordsSchema>;

export const ANALYZE_RECORDS_DESCRIPTION =
  "Use this when an answer needs arithmetic over many records that no filter or sum expresses: a median, a ranking with a tie-break, a per-record ratio, normalized duplicates, a join across two entity types, or counting rows by a field the list returns. " +
  "It runs up to ten read-only tool calls, collects every page of each list (up to 10,000 rows and 8 MB in total, never a truncated set), and passes the results to your JavaScript function (data) => result, which runs in an isolated sandbox with no network, clock or tools. " +
  "The function may be async, but there is nothing to await: tools cannot be called from the code, so every read goes in reads. " +
  "data[i] is reads[i]'s structured result; list results carry total and items across all pages. " +
  "In an analysis a list_records item carries id, name, userIds (its owners), the ids of its linked records (contactIds, organizationIds, dealIds, serviceIds, taskIds, whichever the entity has; an empty array means none is linked), customFieldValues [{columnId, value}], createdAt and updatedAt, and for deals totalValue, totalQuantity and weightedValue. " +
  "So a join, such as the deals that have an open task, is two list reads and one function. A single-select value is the option id, not its label: get_record_schema maps option ids to labels. Pass include: [] on a list read that needs none of these fields. " +
  "When the answer is a count or total per status, owner or month, prefer filters, sums or list_records groupBy, and report figures exactly as the result states them.";

export type AnalysisDeps = { tools: readonly McpTool[]; resultMaxChars: number; limits?: AnalysisLimits };

type Read = AnalyzeRecordsInput["reads"][number];
type TooMuchData = { ok: false; tooMuchData: true };
type ReadResult = { ok: true; data: unknown; rows: number } | { ok: false; error: string } | TooMuchData;
type DataUsage = { chars: number };

const TOO_MUCH_DATA: TooMuchData = { ok: false, tooMuchData: true };
const TOO_MUCH_DATA_ERROR =
  "The reads returned more than 8 MB of data. Narrow them, or pass include: [] on list reads that need no links or custom fields; the analysis code was not run.";

const ANALYSIS_READ_DEFAULTS: Record<string, Record<string, unknown>> = {
  list_records: { include: ["owners", "links", "customFields", "dates"] },
};

function resultTooLarge(chars: number, resultMaxChars: number): { ok: false; result: string } {
  return {
    ok: false,
    result: `The analysis result is ${chars} characters, more than the ${resultMaxChars} one tool result can hold, so it was not returned. Return an aggregate, a top N or a count instead of whole rows.`,
  };
}

function withinDataCap(usage: DataUsage, value: unknown): boolean {
  usage.chars += JSON.stringify(value).length;
  return usage.chars <= ANALYSIS_MAX_BYTES;
}

function counted(usage: DataUsage, result: ReadResult): ReadResult {
  return !result.ok || withinDataCap(usage, result.data) ? result : TOO_MUCH_DATA;
}

function isPageable(mcp: McpTool): boolean {
  const shape = mcp.inputSchema instanceof z.ZodObject ? (mcp.inputSchema.shape as Record<string, unknown>) : {};
  return "page" in shape && "pageSize" in shape;
}

function parseReadInput(read: Read): Record<string, unknown> | string {
  if (read.input === undefined) return {};
  if (typeof read.input !== "string") return read.input;
  try {
    const parsed: unknown = JSON.parse(read.input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return `The input for ${read.tool} is not valid JSON.`;
  }
  return `The input for ${read.tool} must be a JSON object.`;
}

function partialSetError(mcp: McpTool, returned: number, total: number): string {
  return `${mcp.name} returned ${returned} of ${total} rows, so the analysis did not run on a partial set.`;
}

function unpagedResult(mcp: McpTool, content: Record<string, unknown>): ReadResult {
  const arrays = Object.values(content).filter((value): value is unknown[] => Array.isArray(value));
  const total = content.total;
  if (typeof total !== "number" || arrays.length === 0 || arrays.some((array) => array.length >= total))
    return { ok: true, data: content, rows: 0 };
  return { ok: false, error: partialSetError(mcp, Math.max(...arrays.map((array) => array.length)), total) };
}

async function runPage(
  mcp: McpTool,
  input: Record<string, unknown>,
): Promise<{ ok: true; content: Record<string, unknown> } | { ok: false; error: string }> {
  const parsed = mcp.inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `${mcp.name}: ${validationError(parsed.error)}` };
  const outcome = await executeMcpTool(mcp, [parsed.data]);
  if (!outcome.ok) return { ok: false, error: `${mcp.name}: ${outcome.result}` };
  return { ok: true, content: outcome.structuredContent ?? { text: outcome.result } };
}

async function runRead(mcp: McpTool, read: Read, rowBudget: number, usage: DataUsage): Promise<ReadResult> {
  const parsed = parseReadInput(read);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  const input = { ...ANALYSIS_READ_DEFAULTS[mcp.name], ...parsed };
  if (!isPageable(mcp)) {
    const single = await runPage(mcp, input);
    return single.ok ? counted(usage, { ok: true, data: single.content, rows: 0 }) : single;
  }

  const first = await runPage(mcp, { ...input, page: 1, pageSize: ANALYSIS_PAGE_SIZE });
  if (!first.ok) return first;
  const firstContent = Object.fromEntries(
    Object.entries(first.content).filter(([key]) => key !== "page" && key !== "pageSize"),
  );
  const firstItems = firstContent.items;
  if (Array.isArray(firstContent.groups)) return counted(usage, { ok: true, data: firstContent, rows: 0 });
  if (!Array.isArray(firstItems)) return counted(usage, unpagedResult(mcp, firstContent));
  const total = typeof firstContent.total === "number" ? firstContent.total : firstItems.length;
  if (total > rowBudget) {
    const limit =
      rowBudget < ANALYSIS_MAX_ROWS
        ? `the ${rowBudget} left of the ${ANALYSIS_MAX_ROWS} one analysis can work on after its earlier reads`
        : `the ${ANALYSIS_MAX_ROWS} one analysis can work on`;
    return {
      ok: false,
      error: `${mcp.name} matched ${total} rows, more than ${limit}. Narrow its filters, or split the question.`,
    };
  }

  if (!withinDataCap(usage, firstItems)) return TOO_MUCH_DATA;
  const items: unknown[] = [...firstItems];
  for (let page = 2; items.length < total; page += 1) {
    const next = await runPage(mcp, { ...input, page, pageSize: ANALYSIS_PAGE_SIZE });
    if (!next.ok) return next;
    const pageItems = next.content.items;
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;
    if (next.content.pageLimitReached === true) {
      return {
        ok: false,
        error: `${mcp.name} stopped at its page limit before every row was read. Narrow its filters.`,
      };
    }
    if (!withinDataCap(usage, pageItems)) return TOO_MUCH_DATA;
    items.push(...pageItems);
  }
  if (items.length < total) return { ok: false, error: partialSetError(mcp, items.length, total) };
  return { ok: true, data: { ...firstContent, items }, rows: items.length };
}

async function readAll(
  planned: readonly { read: Read; mcp: McpTool }[],
): Promise<{ ok: true; input: string; rows: number } | { ok: false; result: string }> {
  const data: unknown[] = [];
  const usage: DataUsage = { chars: 0 };
  let rows = 0;
  for (const { read, mcp } of planned) {
    const outcome = await runRead(mcp, read, ANALYSIS_MAX_ROWS - rows, usage);
    if (!outcome.ok) {
      return {
        ok: false,
        result: "error" in outcome ? `${outcome.error} The analysis code was not run.` : TOO_MUCH_DATA_ERROR,
      };
    }
    rows += outcome.rows;
    data.push(outcome.data);
  }
  const input = JSON.stringify(data);
  if (input.length > ANALYSIS_MAX_BYTES) return { ok: false, result: TOO_MUCH_DATA_ERROR };
  return { ok: true, input, rows };
}

export async function analyzeRecords(
  input: AnalyzeRecordsInput,
  deps: AnalysisDeps,
): Promise<{ ok: boolean; result: string }> {
  const readable = new Map(deps.tools.filter((mcp) => isReadOnlyTool(mcp)).map((mcp) => [mcp.name, mcp]));
  const planned: { read: Read; mcp: McpTool }[] = [];
  for (const read of input.reads) {
    const mcp = readable.get(read.tool);
    if (!mcp) {
      return {
        ok: false,
        result: `${read.tool} is not a read-only tool this analysis can call. Nothing was run. Readable tools: ${[...readable.keys()].sort().join(", ")}.`,
      };
    }
    planned.push({ read, mcp });
  }

  const collected = await readAll(planned);
  if (!collected.ok) return collected;

  const opening = `{"rowsRead":${collected.rows},"result":`;
  const analysis = await runAnalysisCode(
    input.code,
    collected.input,
    deps.resultMaxChars - opening.length - 1,
    deps.limits,
  );
  if (!analysis.ok) {
    if ("error" in analysis) return { ok: false, result: analysis.error };
    return resultTooLarge(opening.length + analysis.resultChars + 1, deps.resultMaxChars);
  }
  const result = `${opening}${analysis.serialized ?? "null"}}`;
  if (result.length > deps.resultMaxChars) return resultTooLarge(result.length, deps.resultMaxChars);
  return { ok: true, result };
}
