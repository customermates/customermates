import { z } from "zod";

import { executeMcpTool, validationError, type McpTool } from "@/features/mcp-tools/mcp-tool";

import { checkAnalysisCode, runAnalysisCode, type AnalysisLimits } from "./agent-analysis-isolate";
import { isReadOnlyTool } from "./gated-tools";

export const ANALYSIS_MAX_READS = 10;
export const ANALYSIS_MAX_ROWS = 10_000;
export const ANALYSIS_MAX_BYTES = 8 * 1024 * 1024;
const ANALYSIS_PAGE_SIZE = 100;
const ANALYSIS_MAX_PAGE_SIZE = 500;
const CURSOR_PAGE_DEFAULT_LIMIT = 10;
const CURSOR_PAGE_MAX_LIMIT = 100;

export const AnalyzeRecordsSchema = z.object({
  reads: z
    .array(
      z.object({
        tool: z
          .string()
          .min(1)
          .describe("A read-only workspace tool, for example query_crm_records or get_messaging_threads"),
        input: z
          .union([z.record(z.string(), z.unknown()), z.string()])
          .optional()
          .describe(
            'That tool\'s input as a JSON object (a JSON string is also accepted), for example {"typeId":"<type id>","filters":[{"fieldId":"<field id>","operator":"startsWith","value":{"kind":"text","value":"Atlas-"}}]}. Paging is handled for you: omit page and pageSize.',
          ),
      }),
    )
    .min(1)
    .max(ANALYSIS_MAX_READS)
    .describe(
      `One to ${ANALYSIS_MAX_READS} reads, run in order before the code; data[i] is the full result of reads[i]`,
    ),
  code: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      "A JavaScript function expression (data) => result. It may be async, but there is nothing to await: tools cannot be called from the code, so every read goes in reads. It runs with no network or clock, so Date is undefined: dates are ISO strings to compare or slice as text, such as value.slice(0, 7) for the month. It must return JSON-serializable data.",
    ),
});

type AnalyzeRecordsInput = z.infer<typeof AnalyzeRecordsSchema>;

export const ANALYZE_RECORDS_DESCRIPTION =
  "Use this when an answer needs arithmetic over many records that no filter, grouping or measure expresses: a median, a ranking with a tie-break, a per-record ratio, normalized duplicates, a join across two record types, or counting rows by a field the query returns. " +
  `It runs up to ${ANALYSIS_MAX_READS} read-only workspace tool calls (never LinkedIn or social provider tools), collects every page of each list (up to 10,000 rows and 8 MB in total, never a truncated set), and passes the results to your JavaScript function (data) => result, which runs in an isolated sandbox with no network, clock or tools. ` +
  "The function may be async, but there is nothing to await: tools cannot be called from the code, so every read goes in reads. " +
  "data[i] is reads[i]'s structured result; a query_crm_records result carries total and records across all pages. " +
  'In an analysis a query_crm_records record carries ref {typeId, recordId}, version, createdAt, updatedAt, assignedUserIds and fields [{fieldId, result}], where result is {state: value, value} with a typed value, or a missing, restricted or error state; decimal and currency values are exact strings such as "1250.50", never numbers. Pass fields with only the field ids the code needs to keep reads small, and includeRelationships to get linked record refs. ' +
  "Relationships list only records you can read, so an empty records array means none you can see is linked; a relationship whose hasMore is true holds only part of its links, and the analysis refuses it: join from the other type instead. " +
  "So a join, such as the deals that have an open task, is two query reads and one function. A single-select value is the option id and a multiple-choice value an array of option ids, not labels: get_record_model maps option ids to labels. Date is undefined in the sandbox: createdAt, updatedAt and date values are ISO strings to compare or slice as text, for example value.slice(0, 7) for the month. " +
  "When the answer is a count or total per status, owner, or created or updated month, prefer query_crm_measure or query_crm_records grouping with groupSummaries, and report figures exactly as the result states them.";

export type AnalysisDeps = { tools: readonly McpTool[]; resultMaxChars: number; limits?: AnalysisLimits };

type Read = AnalyzeRecordsInput["reads"][number];
type TooMuchData = { ok: false; tooMuchData: true };
type ReadResult = { ok: true; data: unknown; rows: number } | { ok: false; error: string } | TooMuchData;
type DataUsage = { bytes: number };

const TOO_MUCH_DATA: TooMuchData = { ok: false, tooMuchData: true };
const TOO_MUCH_DATA_ERROR =
  "The reads returned more than 8 MB of data. Narrow them, or pass fields with only the needed field ids and no includeRelationships on query_crm_records reads; the analysis code was not run.";

function resultTooLarge(chars: number, resultMaxChars: number): { ok: false; result: string } {
  return {
    ok: false,
    result: `The analysis result is ${chars} characters, more than the ${resultMaxChars} one tool result can hold, so it was not returned. Return an aggregate, a top N or a count instead of whole rows.`,
  };
}

function withinDataCap(usage: DataUsage, value: unknown): boolean {
  usage.bytes += Buffer.byteLength(JSON.stringify(value), "utf8");
  return usage.bytes <= ANALYSIS_MAX_BYTES;
}

function counted(usage: DataUsage, result: ReadResult): ReadResult {
  return !result.ok || withinDataCap(usage, result.data) ? result : TOO_MUCH_DATA;
}

function inputShape(mcp: McpTool): Record<string, unknown> {
  return mcp.inputSchema instanceof z.ZodObject ? (mcp.inputSchema.shape as Record<string, unknown>) : {};
}

function isPageable(mcp: McpTool): boolean {
  const shape = inputShape(mcp);
  return "page" in shape && "pageSize" in shape;
}

function pagesByCursorOrOffset(mcp: McpTool): boolean {
  const shape = inputShape(mcp);
  return !isPageable(mcp) && ("cursor" in shape || "offset" in shape);
}

function numberBound(schema: unknown): number | null {
  const unwrapped = schema instanceof z.ZodDefault || schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  return unwrapped instanceof z.ZodNumber && Number.isFinite(unwrapped.maxValue ?? Number.NaN)
    ? (unwrapped.maxValue as number)
    : null;
}

function analysisPageSize(mcp: McpTool): number {
  const largest = numberBound(inputShape(mcp).pageSize);
  return largest === null ? ANALYSIS_PAGE_SIZE : Math.min(largest, ANALYSIS_MAX_PAGE_SIZE);
}

function readableRows(mcp: McpTool): number {
  const lastPage = numberBound(inputShape(mcp).page);
  return lastPage === null ? Number.POSITIVE_INFINITY : lastPage * analysisPageSize(mcp);
}

const LIST_KEYS = ["items", "records"] as const;

function listKey(content: Record<string, unknown>): (typeof LIST_KEYS)[number] | null {
  return LIST_KEYS.find((key) => Array.isArray(content[key])) ?? null;
}

function incompleteGrouping(grouping: unknown): boolean {
  if (!grouping || typeof grouping !== "object") return false;
  const { partial, groups } = grouping as { partial?: unknown; groups?: unknown };
  if (partial === true || !Array.isArray(groups)) return true;
  return groups.some((group) => {
    const { hasMore, materialised } = (group ?? {}) as { hasMore?: unknown; materialised?: unknown };
    return hasMore === true || materialised === false;
  });
}

function truncatedRelationship(rows: readonly unknown[]): boolean {
  return rows.some((row) => {
    const relationships = (row as { relationships?: unknown } | null)?.relationships;
    return (
      Array.isArray(relationships) &&
      relationships.some((relationship) => (relationship as { hasMore?: unknown } | null)?.hasMore === true)
    );
  });
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

function partialList(entry: unknown): { returned: number; total: number } | null {
  if (!entry || typeof entry !== "object") return null;
  const { items, total } = entry as { items?: unknown; total?: unknown };
  if (!Array.isArray(items) || typeof total !== "number" || items.length >= total) return null;
  return { returned: items.length, total };
}

function unpagedResult(mcp: McpTool, content: Record<string, unknown>): ReadResult {
  const arrays = Object.values(content).filter((value): value is unknown[] => Array.isArray(value));
  const total = content.total;
  if (typeof total === "number" && arrays.length > 0 && arrays.every((array) => array.length < total))
    return { ok: false, error: partialSetError(mcp, Math.max(...arrays.map((array) => array.length)), total) };
  const nested = arrays
    .flat()
    .map(partialList)
    .find((partial) => partial !== null);
  if (nested) return { ok: false, error: partialSetError(mcp, nested.returned, nested.total) };
  return { ok: true, data: content, rows: 0 };
}

async function runPage(
  mcp: McpTool,
  input: Record<string, unknown>,
): Promise<
  { ok: true; input: Record<string, unknown>; content: Record<string, unknown> } | { ok: false; error: string }
> {
  const parsed = mcp.inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `${mcp.name}: ${validationError(parsed.error)}` };
  const outcome = await executeMcpTool(mcp, [parsed.data]);
  if (!outcome.ok) return { ok: false, error: `${mcp.name}: ${outcome.result}` };
  return {
    ok: true,
    input: parsed.data as Record<string, unknown>,
    content: outcome.structuredContent ?? { text: outcome.result },
  };
}

function moreRowsResult(mcp: McpTool, rows: number, limit: number): ReadResult {
  const advice =
    rows >= limit && limit < CURSOR_PAGE_MAX_LIMIT
      ? `Pass a limit above the row count, at most ${CURSOR_PAGE_MAX_LIMIT}, or call ${mcp.name} directly and page through it.`
      : `Call ${mcp.name} directly and page through it.`;
  return {
    ok: false,
    error: `${mcp.name} returned ${rows} rows and more may follow, so the analysis did not run on a partial set. ${advice}`,
  };
}

async function cursorPageResult(
  mcp: McpTool,
  input: Record<string, unknown>,
  content: Record<string, unknown>,
): Promise<ReadResult> {
  const { items, next_cursor: nextCursor, total } = content;
  if (!Array.isArray(items)) return unpagedResult(mcp, content);
  const limit = typeof input.limit === "number" ? input.limit : CURSOR_PAGE_DEFAULT_LIMIT;
  if (typeof nextCursor === "string") return moreRowsResult(mcp, items.length, limit);
  if (typeof total === "number") return unpagedResult(mcp, content);
  if (items.length > 0) {
    if (!("offset" in inputShape(mcp))) return moreRowsResult(mcp, items.length, limit);
    const after = await runPage(mcp, { ...input, offset: items.length, limit });
    if (!after.ok) {
      return {
        ok: false,
        error: `${mcp.name} returned ${items.length} rows and no total, and the read at offset ${items.length} that checks for more failed, so the analysis did not run on a partial set. ${after.error}`,
      };
    }
    const more = after.content.items;
    if (!Array.isArray(more) || more.length > 0) return moreRowsResult(mcp, items.length, limit);
  }
  return unpagedResult(mcp, { total: items.length, ...content });
}

async function runRead(mcp: McpTool, read: Read, rowBudget: number, usage: DataUsage): Promise<ReadResult> {
  const parsed = parseReadInput(read);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  const input = { ...parsed };
  const byCursor = pagesByCursorOrOffset(mcp);
  if (byCursor && (input.cursor !== undefined || (typeof input.offset === "number" && input.offset > 0))) {
    return {
      ok: false,
      error: `${mcp.name} starts past its first page when cursor or offset is set, so the analysis did not run on a partial set. Drop cursor and offset.`,
    };
  }
  if (!isPageable(mcp)) {
    const single = await runPage(mcp, input);
    if (!single.ok) return single;
    return counted(
      usage,
      byCursor ? await cursorPageResult(mcp, single.input, single.content) : unpagedResult(mcp, single.content),
    );
  }

  const pageSize = analysisPageSize(mcp);
  const first = await runPage(mcp, { ...input, page: 1, pageSize });
  if (!first.ok) return first;
  const firstContent = Object.fromEntries(
    Object.entries(first.content).filter(([key]) => key !== "page" && key !== "pageSize"),
  );
  const key = listKey(firstContent);
  const firstItems = key ? firstContent[key] : firstContent.items;
  if (firstContent.scopeTruncated === true) {
    return {
      ok: false,
      error: `${mcp.name} left out every message, activity and calendar event because its filters or scope reach too many contacts. Narrow them.`,
    };
  }
  if (firstContent.grouping !== undefined) {
    if (!incompleteGrouping(firstContent.grouping)) return counted(usage, { ok: true, data: firstContent, rows: 0 });
    return {
      ok: false,
      error: `${mcp.name} returned only some groups or only part of some groups' records, so the analysis did not run on a partial set. Read the records without grouping and group them in the code.`,
    };
  }
  if (Array.isArray(firstContent.groups)) {
    if (firstContent.groupsIncomplete !== true) return counted(usage, { ok: true, data: firstContent, rows: 0 });
    return {
      ok: false,
      error: `${mcp.name} listed only some groups, or the sums of only some groups, so the analysis did not run on a partial set. Read the rows without groupBy and group them in the code.`,
    };
  }
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
  const reachable = readableRows(mcp);
  if (total > reachable) {
    return {
      ok: false,
      error: `${mcp.name} matched ${total} rows, more than the ${reachable} its page limit lets one analysis read. Narrow its filters.`,
    };
  }

  if (!withinDataCap(usage, firstItems)) return TOO_MUCH_DATA;
  const items: unknown[] = [...firstItems];
  for (let page = 2; items.length < total; page += 1) {
    const next = await runPage(mcp, { ...input, page, pageSize });
    if (!next.ok) return next;
    const pageItems = next.content[key ?? "items"];
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
  if (truncatedRelationship(items)) {
    return {
      ok: false,
      error: `${mcp.name} returned a relationship that lists only part of its linked records, so the analysis did not run on a partial set. Read the linked type and join from its side instead.`,
    };
  }
  return { ok: true, data: { ...firstContent, [key ?? "items"]: items }, rows: items.length };
}

async function readAll(
  planned: readonly { read: Read; mcp: McpTool }[],
): Promise<{ ok: true; input: string; rows: number } | { ok: false; result: string }> {
  const data: unknown[] = [];
  const usage: DataUsage = { bytes: 0 };
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
  if (Buffer.byteLength(input, "utf8") > ANALYSIS_MAX_BYTES) return { ok: false, result: TOO_MUCH_DATA_ERROR };
  return { ok: true, input, rows };
}

export async function analyzeRecords(
  input: AnalyzeRecordsInput,
  deps: AnalysisDeps,
): Promise<{ ok: boolean; result: string }> {
  const readable = new Map(
    deps.tools
      .filter((mcp) => isReadOnlyTool(mcp) && mcp.annotations?.openWorldHint === false)
      .map((mcp) => [mcp.name, mcp]),
  );
  const readableTools = `Readable tools: ${[...readable.keys()].sort().join(", ")}.`;
  const planned: { read: Read; mcp: McpTool }[] = [];
  for (const read of input.reads) {
    const mcp = readable.get(read.tool);
    if (!mcp) {
      return {
        ok: false,
        result: `${read.tool} is not a read-only workspace tool this analysis can call. Nothing was run. ${readableTools}`,
      };
    }
    planned.push({ read, mcp });
  }

  const unparsed = await checkAnalysisCode(input.code, deps.limits);
  if (unparsed) return { ok: false, result: `${unparsed} No read was run.` };

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
