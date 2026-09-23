import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { McpTool } from "@/features/mcp-tools/mcp-tool";

import { analyzeRecords } from "../agent-analysis";

function listTool(name: string, rows: number) {
  const execute = vi.fn(({ page, pageSize }: { page: number; pageSize: number }) => {
    const items = Array.from({ length: rows }, (_, index) => ({ id: `row-${index + 1}`, value: index + 1 })).slice(
      (page - 1) * pageSize,
      page * pageSize,
    );
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

describe("analyze_records", () => {
  it("reads every page of a list with the largest page size and hands the full set to the code", async () => {
    const { tool, execute } = listTool("list_things", 250);
    const outcome = await analyzeRecords(
      {
        reads: [read("list_things", { prefix: "A" })],
        code: "(data) => ({ rows: data[0].items.length, total: data[0].total, sum: data[0].items.reduce((s, r) => s + r.value, 0) })",
      },
      { tools: [tool] },
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
      { tools: [tool, detail] },
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
      { tools: [grouped] },
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

    await expect(analyzeRecords(input, { tools: [threadTool(250)] })).resolves.toEqual({
      ok: false,
      result:
        "get_messaging_threads returned 100 of 250 rows, so the analysis did not run on a partial set. The analysis code was not run.",
    });
    await expect(analyzeRecords(input, { tools: [threadTool(40)] })).resolves.toEqual({
      ok: true,
      result: JSON.stringify({ rowsRead: 0, result: 40 }),
    });
  });

  it("refuses a tool that is not read-only or not known, before any read runs", async () => {
    const { tool, execute } = listTool("list_things", 3);
    for (const name of ["update_things", "delete_records"]) {
      const outcome = await analyzeRecords(
        { reads: [read("list_things"), read(name)], code: "() => 1" },
        { tools: [tool, writer] },
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.result).toContain(`${name} is not a read-only tool`);
      expect(outcome.result).toContain("Readable tools: list_things.");
    }
    expect(execute).not.toHaveBeenCalled();
    expect(writeExecute).not.toHaveBeenCalled();
  });

  it("refuses a set larger than 5,000 rows instead of computing over part of it", async () => {
    const { tool, execute } = listTool("list_things", 5_001);
    const outcome = await analyzeRecords(
      { reads: [read("list_things")], code: "(data) => data[0].items.length" },
      { tools: [tool] },
    );
    expect(outcome).toEqual({
      ok: false,
      result:
        "list_things matched 5001 rows, more than the 5000 one analysis can work on. Narrow its filters, or split the question. The analysis code was not run.",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("counts the row budget across reads", async () => {
    const { tool } = listTool("list_things", 3_000);
    const outcome = await analyzeRecords(
      { reads: [read("list_things"), read("list_things")], code: "() => 1" },
      { tools: [tool] },
    );
    expect(outcome).toEqual({
      ok: false,
      result:
        "list_things matched 3000 rows, more than the 2000 left of the 5000 one analysis can work on after its earlier reads. Narrow its filters, or split the question. The analysis code was not run.",
    });
  });

  it("stops on an unreadable input or a failed read, and reports a failing function", async () => {
    const { tool } = listTool("list_things", 3);
    await expect(
      analyzeRecords({ reads: [{ tool: "list_things", input: "{nope" }], code: "() => 1" }, { tools: [tool] }),
    ).resolves.toEqual({
      ok: false,
      result: "The input for list_things is not valid JSON. The analysis code was not run.",
    });
    const invalid = await analyzeRecords({ reads: [read("get_detail", {})], code: "() => 1" }, { tools: [detail] });
    expect(invalid.ok).toBe(false);
    expect(invalid.result).toMatch(/^get_detail: Validation error:.*The analysis code was not run\.$/s);
    const failing = await analyzeRecords(
      { reads: [read("list_things")], code: "(data) => data.missing.length" },
      { tools: [tool] },
    );
    expect(failing.ok).toBe(false);
    expect(failing.result).toMatch(/^The analysis code failed:/);
  });
});
