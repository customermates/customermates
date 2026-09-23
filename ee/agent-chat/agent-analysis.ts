import { z } from "zod";

import { executeMcpTool, validationError, type McpTool } from "@/features/mcp-tools/mcp-tool";

import { runAnalysisCode } from "./agent-analysis-isolate";
import { isReadOnlyTool } from "./gated-tools";

export const ANALYSIS_MAX_ROWS = 5_000;
export const ANALYSIS_MAX_BYTES = 8 * 1024 * 1024;
const ANALYSIS_PAGE_SIZE = 100;

export const AnalyzeRecordsSchema = z.object({
  reads: z
    .array(
      z.object({
        tool: z.string().min(1).describe("A read-only tool, for example list_records or get_messaging_threads"),
        input: z
          .string()
          .default("{}")
          .describe(
            'That tool\'s input as a JSON object string, for example {"entity":"deal","filters":[{"field":"name","operator":"startsWith","value":"Atlas-"}]}. Paging is handled for you: omit page and pageSize.',
          ),
      }),
    )
    .min(1)
    .max(5)
    .describe("One to five reads, run in order before the code; data[i] is the full result of reads[i]"),
  code: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      "A synchronous JavaScript function expression (data) => result, without async or await. It runs with no network, clock or other tools, and must return JSON-serializable data.",
    ),
});

export type AnalyzeRecordsInput = z.infer<typeof AnalyzeRecordsSchema>;

export const ANALYZE_RECORDS_DESCRIPTION =
  "Use this when an answer needs arithmetic over many records that no filter or sum expresses: a median, a ranking with a tie-break, a per-record ratio, normalized duplicates, or counting rows by a field the list returns. " +
  "It runs up to five read-only tool calls, collects every page of each list (up to 5,000 rows and 8 MB in total, never a truncated set), and passes the results to your synchronous JavaScript function (data) => result, which runs in an isolated sandbox with no network, clock or tools. " +
  "data[i] is reads[i]'s structured result; list results carry total and items across all pages. A list_records item holds only id, name and, for deals, totalValue, totalQuantity and weightedValue: no owners, links or custom fields. " +
  "When the answer depends on those, or is a count or total per status, owner or month, use filters, sums or list_records groupBy instead, and report figures exactly as the result states them.";

export type AnalysisDeps = { tools: readonly McpTool[] };

type Read = { tool: string; input: string };
type ReadResult = { ok: true; data: unknown; rows: number } | { ok: false; error: string };

function isPageable(mcp: McpTool): boolean {
  const shape = mcp.inputSchema instanceof z.ZodObject ? (mcp.inputSchema.shape as Record<string, unknown>) : {};
  return "page" in shape && "pageSize" in shape;
}

function parseReadInput(read: Read): Record<string, unknown> | string {
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

async function runRead(mcp: McpTool, read: Read, rowBudget: number): Promise<ReadResult> {
  const input = parseReadInput(read);
  if (typeof input === "string") return { ok: false, error: input };
  if (!isPageable(mcp)) {
    const single = await runPage(mcp, input);
    return single.ok ? { ok: true, data: single.content, rows: 0 } : single;
  }

  const first = await runPage(mcp, { ...input, page: 1, pageSize: ANALYSIS_PAGE_SIZE });
  if (!first.ok) return first;
  const firstContent = Object.fromEntries(
    Object.entries(first.content).filter(([key]) => key !== "page" && key !== "pageSize"),
  );
  const firstItems = firstContent.items;
  if (Array.isArray(firstContent.groups)) return { ok: true, data: firstContent, rows: 0 };
  if (!Array.isArray(firstItems)) return unpagedResult(mcp, firstContent);
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
    items.push(...pageItems);
  }
  if (items.length < total) return { ok: false, error: partialSetError(mcp, items.length, total) };
  return { ok: true, data: { ...firstContent, items }, rows: items.length };
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

  const data: unknown[] = [];
  let rows = 0;
  for (const { read, mcp } of planned) {
    const outcome = await runRead(mcp, read, ANALYSIS_MAX_ROWS - rows);
    if (!outcome.ok) return { ok: false, result: `${outcome.error} The analysis code was not run.` };
    rows += outcome.rows;
    data.push(outcome.data);
  }
  if (JSON.stringify(data).length > ANALYSIS_MAX_BYTES) {
    return {
      ok: false,
      result: "The reads returned more than 8 MB of data. Narrow them; the analysis code was not run.",
    };
  }

  const analysis = await runAnalysisCode(input.code, data);
  if (!analysis.ok) return { ok: false, result: analysis.error };
  return { ok: true, result: JSON.stringify({ rowsRead: rows, result: analysis.value }) };
}
