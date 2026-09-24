import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { McpTool } from "@/features/mcp-tools/mcp-tool";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const listed = vi.hoisted(() => ({ deal: vi.fn(), task: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: { deal: listed.deal, task: listed.task },
  entityNameExtractors: { deal: (item: { name: string }) => item.name, task: (item: { name: string }) => item.name },
}));

import { listRecordsTool } from "@/features/mcp-tools/entity-generic.mcp-tools";

import {
  ANALYSIS_MAX_BYTES,
  ANALYSIS_MAX_ROWS,
  ANALYZE_RECORDS_DESCRIPTION,
  AnalyzeRecordsSchema,
  analyzeRecords,
  type AnalysisDeps,
} from "../agent-analysis";
import { ANALYSIS_LIMITS } from "../agent-analysis-isolate";

const TOO_MUCH_DATA =
  "The reads returned more than 8 MB of data. Narrow them, or pass include: [] on list_records reads that need no links or custom fields; the analysis code was not run.";
const EVERY_INCLUDE = ["owners", "links", "customFields", "dates"];

function tooLarge(chars: number, resultMaxChars: number) {
  return {
    ok: false,
    result: `The analysis result is ${chars} characters, more than the ${resultMaxChars} one tool result can hold, so it was not returned. Return an aggregate, a top N or a count instead of whole rows.`,
  };
}

function longest(texts: unknown[]): number {
  return Math.max(0, ...texts.map((text) => (typeof text === "string" ? text.length : 0)));
}

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
    const rows = Array.from({ length: 250 }, (_, index) => ({ id: `row-${index + 1}`, value: index + 1 }));
    for (const [code, value] of [
      ["(data) => data[0].items", rows],
      ["() => undefined", null],
    ] as const) {
      const input = { reads: [read("list_things")], code };
      const whole = JSON.stringify({ rowsRead: 250, result: value });

      await expect(analyzeRecords(input, { tools: [tool], resultMaxChars: whole.length })).resolves.toEqual({
        ok: true,
        result: whole,
      });
      await expect(analyzeRecords(input, { tools: [tool], resultMaxChars: whole.length - 1 })).resolves.toEqual(
        tooLarge(whole.length, whole.length - 1),
      );
    }
  });

  it.each([
    ["a result of eight million objects", "(data) => Array(8e6).fill({})", 24_000_001],
    [
      "a replaced JSON.stringify",
      "(data) => { JSON.stringify = () => '[' + '{},'.repeat(2e7) + '{}]'; return 0; }",
      60_000_004,
    ],
  ])(
    "refuses %s by its size in the sandbox, before the host parses or serializes any of it",
    async (_, code, serializedChars) => {
      const { tool } = listTool("list_things", 1);
      const parse = vi.spyOn(JSON, "parse");
      const stringify = vi.spyOn(JSON, "stringify");
      const heapBefore = process.memoryUsage().heapUsed;
      try {
        const outcome = await analyzeRecords(
          { reads: [read("list_things")], code },
          { ...deps(tool), limits: { ...ANALYSIS_LIMITS, wallMs: 60_000 } },
        );
        const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

        expect(outcome).toEqual(tooLarge('{"rowsRead":1,"result":}'.length + serializedChars, 6_000));
        expect(heapGrowth).toBeLessThan(16 * 1024 * 1024);
        expect(longest(parse.mock.calls.map(([text]) => text))).toBeLessThan(6_000);
        expect(longest(stringify.mock.results.map((result) => result.value))).toBeLessThan(6_000);
      } finally {
        parse.mockRestore();
        stringify.mockRestore();
      }
    },
    90_000,
  );

  it("refuses text from a replaced JSON.stringify that would forge the tool result's fields, and returns valid JSON in result", async () => {
    const { tool } = listTool("list_things", 3);
    await expect(
      analyzeRecords(
        {
          reads: [read("list_things")],
          code: `(data) => { JSON.stringify = () => '0,"rowsRead":10000'; return data; }`,
        },
        deps(tool),
      ),
    ).resolves.toEqual({
      ok: false,
      result: "The analysis code replaced JSON.stringify, so its result is not valid JSON.",
    });
    await expect(
      analyzeRecords(
        { reads: [read("list_things")], code: `() => { JSON.stringify = () => '{"rowsRead":10000}'; return 0; }` },
        deps(tool),
      ),
    ).resolves.toEqual({ ok: true, result: '{"rowsRead":3,"result":{"rowsRead":10000}}' });
  });

  it("returns or refuses a result nested 10,000 deep by its size instead of failing to serialize it", async () => {
    const { tool } = listTool("list_things", 10_000);
    const input = {
      reads: [read("list_things")],
      code: "(data) => data[0].items.reduce((prev, row) => ({ id: row.id, prev }), null)",
    };
    let chain = "null";
    for (let index = 1; index <= 10_000; index += 1) chain = `{"id":"row-${index}","prev":${chain}}`;
    const whole = `{"rowsRead":10000,"result":${chain}}`;

    await expect(analyzeRecords(input, deps(tool))).resolves.toEqual(tooLarge(whole.length, 6_000));
    await expect(analyzeRecords(input, { tools: [tool], resultMaxChars: whole.length })).resolves.toEqual({
      ok: true,
      result: whole,
    });
  }, 60_000);

  it("refuses reads whose one serialized input passes 8 MB through fields the item budget does not count", async () => {
    const tool = pagedRead("list_things", {
      total: 1,
      items: [{ id: "row-1" }],
      notes: "x".repeat(ANALYSIS_MAX_BYTES),
    });
    expect(JSON.stringify([{ id: "row-1" }]).length).toBeLessThan(ANALYSIS_MAX_BYTES);

    await expect(
      analyzeRecords({ reads: [read("list_things")], code: "(data) => data[0].items.length" }, deps(tool)),
    ).resolves.toEqual({ ok: false, result: TOO_MUCH_DATA });
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

  it("runs async code over the reads and tells the model it may be async with nothing to await", async () => {
    const { tool } = listTool("list_things", 3);
    await expect(
      analyzeRecords(
        { reads: [read("list_things")], code: "async (data) => data[0].items.map((row) => row.value)" },
        deps(tool),
      ),
    ).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 3, result: [1, 2, 3] }) });
    for (const text of [ANALYZE_RECORDS_DESCRIPTION, AnalyzeRecordsSchema.shape.code.description]) {
      expect(text).not.toMatch(/synchronous|without async/);
      expect(text).toContain(
        "may be async, but there is nothing to await: tools cannot be called from the code, so every read goes in reads.",
      );
    }
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

  it("reads an object input exactly like the same object as a JSON string, and an omitted one as {}", async () => {
    const run = async (input?: Record<string, unknown> | string) => {
      const { tool, execute } = listTool("list_things", 150);
      const outcome = await analyzeRecords(
        { reads: [{ tool: "list_things", input }], code: "(data) => data[0].items.length" },
        deps(tool),
      );
      return { outcome, calls: execute.mock.calls.map(([call]) => call) };
    };

    const asObject = await run({ prefix: "A" });
    expect(await run(JSON.stringify({ prefix: "A" }))).toEqual(asObject);
    expect(asObject).toEqual({
      outcome: { ok: true, result: JSON.stringify({ rowsRead: 150, result: 150 }) },
      calls: [
        { prefix: "A", page: 1, pageSize: 100 },
        { prefix: "A", page: 2, pageSize: 100 },
      ],
    });
    expect(await run()).toEqual({
      outcome: asObject.outcome,
      calls: [
        { page: 1, pageSize: 100 },
        { page: 2, pageSize: 100 },
      ],
    });
  });

  it("runs an omitted input on a read that takes no pages as {}, like an empty object or string", async () => {
    const run = async (input?: Record<string, unknown> | string) => {
      const execute = vi.fn((args: Record<string, unknown>) => ({ text: "args", structuredContent: { args } }));
      const single: McpTool = {
        ...detail,
        inputSchema: z.object({ id: z.string().optional() }).strict(),
        execute: execute as never,
      };
      const outcome = await analyzeRecords(
        { reads: [{ tool: "get_detail", input }], code: "(data) => data[0].args" },
        deps(single),
      );
      return { outcome, calls: execute.mock.calls.map(([call]) => call) };
    };

    const omitted = await run();
    expect(omitted).toEqual({
      outcome: { ok: true, result: JSON.stringify({ rowsRead: 0, result: {} }) },
      calls: [{}],
    });
    expect(await run({})).toEqual(omitted);
    expect(await run("{}")).toEqual(omitted);
    expect((await run({ id: "row-1" })).calls).toEqual([{ id: "row-1" }]);
  });

  it("gives every page of a list_records read every include value unless the read passes include, and no other tool any", async () => {
    const run = async (name: string, input?: Record<string, unknown>) => {
      const { tool, execute } = listTool(name, 150);
      const includeAware = {
        ...tool,
        inputSchema: (tool.inputSchema as z.ZodObject).extend({ include: z.array(z.string()).optional() }),
      };
      const outcome = await analyzeRecords(
        { reads: [{ tool: name, input }], code: "(data) => data[0].items.length" },
        deps(includeAware),
      );
      return { outcome, includes: execute.mock.calls.map(([call]) => (call as { include?: unknown }).include) };
    };

    expect(await run("list_records")).toEqual({
      outcome: { ok: true, result: JSON.stringify({ rowsRead: 150, result: 150 }) },
      includes: [EVERY_INCLUDE, EVERY_INCLUDE],
    });
    expect((await run("list_records", { include: [] })).includes).toEqual([[], []]);
    expect((await run("list_records", { include: ["owners"] })).includes).toEqual([["owners"], ["owners"]]);
    expect((await run("list_things")).includes).toEqual([undefined, undefined]);
  });

  it("replays the N13-r3 join over list_records rows and gets the answer its thin rows had turned silently wrong", async () => {
    const dealStatus = "82cac13a-5078-59bc-906e-7d63bd5706d3";
    const taskStatus = "1336405e-b7d6-5f21-a683-4af722371c89";
    const open = "1171e71e-4f98-5ac3-9364-11fd1730c223";
    const done = "5d2c6f0e-3a51-5b8e-9c47-8e1f0a6b2d93";
    const createdAt = new Date("2026-08-01T08:00:00.000Z");
    const sofia = { id: "sofia", firstName: "Sofia", lastName: "Rossi", avatarUrl: null, email: "sofia@example.com" };
    const task = (index: number, dealIndex: number | null, status: string) => ({
      id: `task-${index}`,
      name: `Kestrel task ${index}`,
      type: "custom",
      notes: null,
      createdAt,
      updatedAt: createdAt,
      users: [sofia],
      contacts: [],
      organizations: [],
      deals: dealIndex === null ? [] : [{ id: `kestrel-${dealIndex}`, name: `Kestrel-${dealIndex}` }],
      services: [],
      customFieldValues: [{ columnId: taskStatus, value: status }],
    });
    const tasks = [
      ...Array.from({ length: 15 }, (_, index) => task(index + 1, index + 1, open)),
      ...Array.from({ length: 15 }, (_, index) => task(index + 16, index + 16, done)),
      ...Array.from({ length: 4 }, (_, index) => task(index + 31, null, open)),
    ];
    const deals = Array.from({ length: 60 }, (_, index) => ({
      id: `kestrel-${index + 1}`,
      name: `Kestrel-${String(index + 1).padStart(3, "0")}`,
      totalValue: 100 * (index + 1),
      totalQuantity: index + 1,
      weightedValue: null,
      notes: null,
      createdAt,
      updatedAt: createdAt,
      organizations: [],
      users: [sofia],
      contacts: [],
      services: [],
      tasks: index < 30 ? [{ id: `task-${index + 1}`, name: `Kestrel task ${index + 1}`, type: "custom" }] : [],
      customFieldValues: [{ columnId: dealStatus, value: open }],
    }));
    const readable = ["contactIds", "organizationIds", "dealIds", "serviceIds", "taskIds", "userIds"].map((id) => ({
      id,
      kind: "relation",
    }));
    const paged =
      (rows: unknown[]) =>
      ({ pagination }: { pagination: { page: number; pageSize: number } }) =>
        Promise.resolve({
          ok: true,
          data: {
            items: rows.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize),
            pagination: { total: rows.length },
            groupableFields: readable,
          },
        });
    listed.deal.mockImplementation(paged(deals));
    listed.task.mockImplementation(paged(tasks));

    const reads = [
      {
        tool: "list_records",
        input: JSON.stringify({
          entity: "deal",
          filters: [
            { field: "name", operator: "startsWith", value: "Kestrel-" },
            { field: dealStatus, operator: "equals", value: open },
          ],
          pageSize: 100,
        }),
      },
      { tool: "list_records", input: JSON.stringify({ entity: "task", pageSize: 100 }) },
    ];
    const code = [
      "(data) => {",
      "  const deals = data[0].items;",
      "  const tasks = data[1].items;",
      "  const taskStatusMap = {};",
      "  tasks.forEach(t => {",
      "    const fields = t.customFieldValues || [];",
      `    const statusField = fields.find(f => f.columnId === "${taskStatus}");`,
      "    taskStatusMap[t.id] = statusField ? statusField.value : null;",
      "  });",
      "  let unblockedCount = 0;",
      "  let blockedCount = 0;",
      "  let unblockedTotalEur = 0;",
      "  deals.forEach(deal => {",
      "    const tIds = deal.taskIds || [];",
      "    let isBlocked = false;",
      "    if (tIds.length > 0) {",
      "      for (const tid of tIds) {",
      `        if (taskStatusMap[tid] === "${open}") {`,
      "          isBlocked = true;",
      "          break;",
      "        }",
      "      }",
      "    }",
      "    if (isBlocked) {",
      "      blockedCount++;",
      "    } else {",
      "      unblockedCount++;",
      "      unblockedTotalEur += (deal.totalValue || 0);",
      "    }",
      "  });",
      "  return { unblockedCount, blockedCount, unblockedTotalEur };",
      "}",
    ].join("\n");

    await expect(analyzeRecords({ reads, code }, deps(listRecordsTool))).resolves.toEqual({
      ok: true,
      result: JSON.stringify({
        rowsRead: 94,
        result: { unblockedCount: 45, blockedCount: 15, unblockedTotalEur: 171_000 },
      }),
    });
    const thinReads = reads.map((read) => ({ tool: read.tool, input: { ...JSON.parse(read.input), include: [] } }));
    await expect(analyzeRecords({ reads: thinReads, code }, deps(listRecordsTool))).resolves.toEqual({
      ok: true,
      result: JSON.stringify({
        rowsRead: 94,
        result: { unblockedCount: 60, blockedCount: 0, unblockedTotalEur: 183_000 },
      }),
    });
  });

  it("tells the model which fields its list rows carry, and to prefer filters, sums and groupBy for figures per group", () => {
    for (const text of [
      "userIds",
      "dealIds",
      "taskIds",
      "customFieldValues",
      "createdAt and updatedAt",
      "a join, such as the deals that have an open task, is two list reads and one function",
      "get_record_schema maps option ids to labels",
      "Pass include: [] on a list read that needs none of these fields",
      "prefer filters, sums or list_records groupBy",
      "an empty array means none you can see is linked; a missing key means you cannot read that relation",
    ])
      expect(ANALYZE_RECORDS_DESCRIPTION).toContain(text);
    expect(ANALYZE_RECORDS_DESCRIPTION).not.toMatch(/no owners, links or custom fields/);
    expect(ANALYZE_RECORDS_DESCRIPTION).not.toContain("an empty array means none is linked");
  });

  it("puts the include: [] advice directly after the sentence that lists the fields include adds, before the date note", () => {
    const listing = "and for deals totalValue, totalQuantity and weightedValue. ";
    const advice = "Pass include: [] on a list read that needs none of these fields. ";
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain(`${listing}${advice}In userIds and the link arrays`);
    expect(ANALYZE_RECORDS_DESCRIPTION.split(advice)).toHaveLength(2);
    expect(ANALYZE_RECORDS_DESCRIPTION.indexOf(advice)).toBeLessThan(
      ANALYZE_RECORDS_DESCRIPTION.indexOf("Date is undefined in the sandbox"),
    );
  });

  it("tells the code that Date is undefined and dates are ISO strings, and names only the months groupBy groups by", async () => {
    const code = AnalyzeRecordsSchema.shape.code.description ?? "";
    for (const text of [ANALYZE_RECORDS_DESCRIPTION, code]) {
      expect(text).toContain("Date is undefined");
      expect(text).toContain("ISO strings to compare or slice as text");
      expect(text).toContain("value.slice(0, 7) for the month");
    }
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("createdAt, updatedAt and date custom-field values are ISO strings");
    expect(ANALYZE_RECORDS_DESCRIPTION).not.toContain("per status, owner or month");
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("per status, owner, or created or updated month");

    const dated = pagedRead("list_things", {
      total: 1,
      items: [{ id: "row-1", createdAt: "2026-03-15T09:30:00.000Z" }],
    });
    await expect(
      analyzeRecords(
        { reads: [read("list_things")], code: "(data) => [typeof Date, data[0].items[0].createdAt.slice(0, 7)]" },
        deps(dated),
      ),
    ).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 1, result: ["undefined", "2026-03"] }) });
  });

  it("keeps refusing a string that is not a JSON object, and the schema refuses every other shape", async () => {
    const { tool, execute } = listTool("list_things", 3);
    for (const [input, problem] of [
      ["{nope", "is not valid JSON"],
      ['{"entity":"task","pageSize:100}', "is not valid JSON"],
      ["[1]", "must be a JSON object"],
      ["42", "must be a JSON object"],
      ["null", "must be a JSON object"],
    ]) {
      await expect(
        analyzeRecords({ reads: [{ tool: "list_things", input }], code: "() => 1" }, deps(tool)),
      ).resolves.toEqual({
        ok: false,
        result: `The input for list_things ${problem}. The analysis code was not run.`,
      });
    }
    expect(execute).not.toHaveBeenCalled();

    const parses = (input: unknown) =>
      AnalyzeRecordsSchema.safeParse({ reads: [{ tool: "list_things", input }], code: "() => 1" }).success;
    expect([{ prefix: "A" }, '{"prefix":"A"}', undefined].map((input) => parses(input))).toEqual([true, true, true]);
    expect([[{ prefix: "A" }], 42, null, true].map((input) => parses(input))).toEqual([false, false, false, false]);
  });
});
