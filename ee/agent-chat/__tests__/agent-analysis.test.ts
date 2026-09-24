import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { McpTool } from "@/features/mcp-tools/mcp-tool";

import {
  ANALYSIS_MAX_BYTES,
  ANALYSIS_MAX_ROWS,
  ANALYZE_RECORDS_DESCRIPTION,
  AnalyzeRecordsSchema,
  analyzeRecords,
  type AnalysisDeps,
} from "../agent-analysis";

const TOO_MUCH_DATA = "The reads returned more than 8 MB of data. Narrow them; the analysis code was not run.";

function listTool(name: string, rows: number, text?: string) {
  const all = Array.from({ length: rows }, (_, index) => ({
    id: `row-${index + 1}`,
    value: index + 1,
    ...(text === undefined ? {} : { text }),
  }));
  const execute = vi.fn(({ page, pageSize }: { page: number; pageSize: number }) => {
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    const payload = { total: rows, page, pageSize, items };
    return { text: JSON.stringify(payload), structuredContent: payload };
  });
  const tool: McpTool = {
    name,
    title: name,
    description: name,
    annotations: { readOnlyHint: true },
    inputSchema: z.object({
      page: z.number().default(1),
      pageSize: z.number().default(25),
      prefix: z.string().optional(),
    }),
    execute: execute as never,
  };
  return { tool, execute };
}

const detail: McpTool = {
  name: "get_detail",
  title: "detail",
  description: "detail",
  annotations: { readOnlyHint: true },
  inputSchema: z.object({ id: z.string() }),
  execute: (({ id }: { id: string }) => ({ text: id, structuredContent: { id, notes: "kept" } })) as never,
};

const writeExecute = vi.fn();
const writer: McpTool = {
  name: "update_things",
  title: "write",
  description: "write",
  annotations: { readOnlyHint: false },
  inputSchema: z.object({}),
  execute: writeExecute as never,
};

const read = (tool: string, input: Record<string, unknown> = {}) => ({ tool, input: JSON.stringify(input) });

function deps(...tools: McpTool[]): AnalysisDeps {
  return { tools, resultMaxChars: 6_000 };
}

describe("analyze_records", () => {
  it("reads every page of a list with the largest page size and hands the full set to the code", async () => {
    const { tool, execute } = listTool("list_things", 250);
    const outcome = await analyzeRecords(
      {
        reads: [read("list_things", { prefix: "A" })],
        code: "(data) => ({ rows: data[0].items.length, total: data[0].total, sum: data[0].items.reduce((s, r) => s + r.value, 0) })",
      },
      deps(tool),
    );

    expect(outcome).toEqual({
      ok: true,
      result: JSON.stringify({ rowsRead: 250, result: { rows: 250, total: 250, sum: 31_375 } }),
    });
    expect(execute.mock.calls.map(([input]) => [input.page, input.pageSize])).toEqual([
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
  });

  it("passes each read's structured result in order, and a single read as it is", async () => {
    const { tool } = listTool("list_things", 3);
    const outcome = await analyzeRecords(
      {
        reads: [read("get_detail", { id: "x" }), read("list_things")],
        code: "(data) => [data[0].notes, data[1].items.length]",
      },
      deps(tool, detail),
    );
    expect(outcome).toEqual({ ok: true, result: JSON.stringify({ rowsRead: 3, result: ["kept", 3] }) });
  });

  it("takes a grouped list as complete in one read instead of paging for items it never returns", async () => {
    const execute = vi.fn(() => {
      const payload = { total: 40, page: 1, pageSize: 100, groups: [{ key: "a", label: "Ada", count: 40 }], items: [] };
      return { text: JSON.stringify(payload), structuredContent: payload };
    });
    const grouped: McpTool = {
      name: "list_records",
      title: "list",
      description: "list",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        page: z.number().default(1),
        pageSize: z.number().default(25),
        groupBy: z.unknown().optional(),
      }),
      execute: execute as never,
    };
    const outcome = await analyzeRecords(
      { reads: [read("list_records", { groupBy: { field: "userIds" } })], code: "(data) => data[0].groups[0].count" },
      deps(grouped),
    );
    expect(outcome).toEqual({ ok: true, result: JSON.stringify({ rowsRead: 0, result: 40 }) });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses a detail read whose first page holds only part of its rows, and passes a complete one", async () => {
    const threadTool = (messages: number): McpTool => ({
      name: "get_messaging_threads",
      title: "threads",
      description: "threads",
      annotations: { readOnlyHint: true },
      inputSchema: z.object({
        threadId: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(25),
      }),
      execute: (({ page, pageSize }: { page: number; pageSize: number }) => {
        const payload = {
          thread: { id: "thread-1", participants: [{ displayName: "Ada" }] },
          messages: Array.from({ length: Math.min(messages, pageSize) }, (_, index) => ({
            id: `message-${index + 1}`,
          })),
          total: messages,
          page,
          pageSize,
        };
        return { text: JSON.stringify(payload), structuredContent: payload };
      }) as never,
    });
    const input = {
      reads: [read("get_messaging_threads", { threadId: "thread-1" })],
      code: "(data) => data[0].messages.length",
    };

    await expect(analyzeRecords(input, deps(threadTool(250)))).resolves.toEqual({
      ok: false,
      result:
        "get_messaging_threads returned 100 of 250 rows, so the analysis did not run on a partial set. The analysis code was not run.",
    });
    await expect(analyzeRecords(input, deps(threadTool(40)))).resolves.toEqual({
      ok: true,
      result: JSON.stringify({ rowsRead: 0, result: 40 }),
    });
  });

  it("refuses a tool that is not read-only or not known, before any read runs", async () => {
    const { tool, execute } = listTool("list_things", 3);
    for (const name of ["update_things", "delete_records"]) {
      const outcome = await analyzeRecords(
        { reads: [read("list_things"), read(name)], code: "() => 1" },
        deps(tool, writer),
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.result).toContain(`${name} is not a read-only tool`);
      expect(outcome.result).toContain("Readable tools: list_things.");
    }
    expect(execute).not.toHaveBeenCalled();
    expect(writeExecute).not.toHaveBeenCalled();
  });

  it("refuses a set larger than 10,000 rows instead of computing over part of it", async () => {
    const { tool, execute } = listTool("list_things", 10_001);
    const outcome = await analyzeRecords(
      { reads: [read("list_things")], code: "(data) => data[0].items.length" },
      deps(tool),
    );
    expect(outcome).toEqual({
      ok: false,
      result:
        "list_things matched 10001 rows, more than the 10000 one analysis can work on. Narrow its filters, or split the question. The analysis code was not run.",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("counts the row budget across reads", async () => {
    const { tool } = listTool("list_things", 6_000);
    const outcome = await analyzeRecords(
      { reads: [read("list_things"), read("list_things")], code: "() => 1" },
      deps(tool),
    );
    expect(outcome).toEqual({
      ok: false,
      result:
        "list_things matched 6000 rows, more than the 4000 left of the 10000 one analysis can work on after its earlier reads. Narrow its filters, or split the question. The analysis code was not run.",
    });
  });

  it("stops paging as soon as the data read passes 8 MB instead of holding every page first", async () => {
    const { tool, execute } = listTool("list_things", 1_000, "x".repeat(20_000));
    const pageChars = JSON.stringify(
      Array.from({ length: 100 }, (_, index) => ({
        id: `row-${index + 1}`,
        value: index + 1,
        text: "x".repeat(20_000),
      })),
    ).length;
    expect(4 * pageChars).toBeLessThan(ANALYSIS_MAX_BYTES);
    expect(5 * pageChars).toBeGreaterThan(ANALYSIS_MAX_BYTES);

    const outcome = await analyzeRecords(
      { reads: [read("list_things")], code: "(data) => data[0].items.length" },
      deps(tool),
    );

    expect(outcome).toEqual({ ok: false, result: TOO_MUCH_DATA });
    expect(execute).toHaveBeenCalledTimes(5);
  });

  const large = "x".repeat(3_000_000);
  const pagedRead = (name: string, content: Record<string, unknown>): McpTool => ({
    name,
    title: name,
    description: name,
    annotations: { readOnlyHint: true },
    inputSchema: z.object({ page: z.number().default(1), pageSize: z.number().default(25) }),
    execute: (({ page, pageSize }: { page: number; pageSize: number }) => {
      const payload = { ...content, page, pageSize };
      return { text: "large", structuredContent: payload };
    }) as never,
  });

  it.each([
    [
      "a read that takes no pages",
      { ...detail, execute: (() => ({ text: "large", structuredContent: { notes: large } })) as never },
      read("get_detail", { id: "x" }),
    ],
    [
      "a paged read with no items",
      pagedRead("get_messaging_threads", { total: 1, messages: [{ body: large }] }),
      read("get_messaging_threads"),
    ],
    ["a grouped list", pagedRead("list_records", { groups: [{ label: large, count: 1 }] }), read("list_records")],
  ])("counts the data of %s toward the same 8 MB as the reads after it", async (_, first, firstRead) => {
    const { tool, execute } = listTool("list_things", 1_000, "x".repeat(20_000));

    const outcome = await analyzeRecords(
      { reads: [firstRead, read("list_things")], code: "() => 1" },
      deps(tool, first),
    );

    expect(outcome).toEqual({ ok: false, result: TOO_MUCH_DATA });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("refuses a result longer than one tool result can hold instead of returning it cut", async () => {
    const { tool } = listTool("list_things", 250);
    const input = { reads: [read("list_things")], code: "(data) => data[0].items" };
    const whole = JSON.stringify({
      rowsRead: 250,
      result: Array.from({ length: 250 }, (_, index) => ({ id: `row-${index + 1}`, value: index + 1 })),
    });

    await expect(analyzeRecords(input, { tools: [tool], resultMaxChars: whole.length })).resolves.toEqual({
      ok: true,
      result: whole,
    });
    await expect(analyzeRecords(input, { tools: [tool], resultMaxChars: whole.length - 1 })).resolves.toEqual({
      ok: false,
      result: `The analysis result is ${whole.length} characters, more than the ${whole.length - 1} one tool result can hold, so it was not returned. Return an aggregate, a top N or a count instead of whole rows.`,
    });
  });

  it("accepts up to ten reads and states the limits it enforces", () => {
    const reads = (count: number) => Array.from({ length: count }, () => read("list_things"));
    expect(AnalyzeRecordsSchema.safeParse({ reads: reads(10), code: "() => 1" }).success).toBe(true);
    expect(AnalyzeRecordsSchema.safeParse({ reads: reads(11), code: "() => 1" }).success).toBe(false);
    expect(ANALYSIS_MAX_ROWS).toBe(10_000);
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("up to ten read-only tool calls");
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("up to 10,000 rows and 8 MB");
    expect(AnalyzeRecordsSchema.shape.reads.description).toMatch(/^One to ten reads/);
  });

  it("stops on an unreadable input or a failed read, and reports a failing function", async () => {
    const { tool } = listTool("list_things", 3);
    await expect(
      analyzeRecords({ reads: [{ tool: "list_things", input: "{nope" }], code: "() => 1" }, deps(tool)),
    ).resolves.toEqual({
      ok: false,
      result: "The input for list_things is not valid JSON. The analysis code was not run.",
    });
    const invalid = await analyzeRecords({ reads: [read("get_detail", {})], code: "() => 1" }, deps(detail));
    expect(invalid.ok).toBe(false);
    expect(invalid.result).toMatch(/^get_detail: Validation error:.*The analysis code was not run\.$/s);
    const failing = await analyzeRecords(
      { reads: [read("list_things")], code: "(data) => data.missing.length" },
      deps(tool),
    );
    expect(failing.ok).toBe(false);
    expect(failing.result).toMatch(/^The analysis code failed:/);
  });
});
