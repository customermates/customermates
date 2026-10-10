import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { McpTool } from "@/features/mcp-tools/mcp-tool";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const listed = vi.hoisted(() => ({ query: vi.fn(), reactions: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getListSocialPostReactionsInteractor: () => ({ invoke: listed.reactions }),
  getQueryRecordsInteractor: () => ({ invoke: listed.query }),
}));

import { queryRecordsV2Tool } from "@/features/mcp-tools/record-model.mcp-tools";
import { getSocialPostEngagementTool } from "@/features/mcp-tools/social-posts.mcp-tools";

import {
  ANALYSIS_MAX_BYTES,
  ANALYSIS_MAX_READS,
  ANALYSIS_MAX_ROWS,
  ANALYZE_RECORDS_DESCRIPTION,
  AnalyzeRecordsSchema,
  analyzeRecords,
  type AnalysisDeps,
} from "../agent-analysis";
import { ANALYSIS_LIMITS } from "../agent-analysis-isolate";

const TOO_MUCH_DATA =
  "The reads returned more than 8 MB of data. Narrow them, or pass fields with only the needed field ids and no includeRelationships on query_crm_records reads; the analysis code was not run.";

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
    annotations: { readOnlyHint: true, openWorldHint: false },
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
  annotations: { readOnlyHint: true, openWorldHint: false },
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

type QueryField = { fieldId: string; result: unknown };
type QueryRelationship = {
  relationId: string;
  direction: "outgoing" | "incoming";
  records: unknown[];
  readableCount: number;
  hasMore: boolean;
};

function record(typeId: string, recordId: string, fields: QueryField[], relationships: QueryRelationship[] = []) {
  return {
    ref: { typeId, recordId },
    version: 1,
    schemaRevision: 1,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    fields,
    assignedUserIds: [],
    assignedUsers: [],
    relationships,
  };
}

function pagedQuery(rows: unknown[]) {
  return ({ page, pageSize }: { page: number; pageSize: number }) =>
    Promise.resolve({
      ok: true,
      data: {
        records: rows.slice((page - 1) * pageSize, page * pageSize),
        total: rows.length,
        page,
        pageSize,
        schemaRevision: 1,
      },
    });
}

describe("analyze_records", () => {
  it("refuses code that does not parse before it runs any read", async () => {
    const { tool, execute } = listTool("list_things", 5);
    const outcome = await analyzeRecords(
      { reads: [{ tool: "list_things", input: {} }], code: "function count(d) { return d.length; } count(data)" },
      deps(tool),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.result).toMatch(
      /^The analysis code does not parse as one function expression \(.+\)\. .+ No read was run\.$/,
    );
    expect(execute).not.toHaveBeenCalled();
  });

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
      name: "list_grouped",
      title: "list",
      description: "list",
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: z.object({
        page: z.number().default(1),
        pageSize: z.number().default(25),
        groupBy: z.unknown().optional(),
      }),
      execute: execute as never,
    };
    const outcome = await analyzeRecords(
      { reads: [read("list_grouped", { groupBy: { field: "userIds" } })], code: "(data) => data[0].groups[0].count" },
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
      annotations: { readOnlyHint: true, openWorldHint: false },
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
      expect(outcome.result).toContain(`${name} is not a read-only workspace tool`);
      expect(outcome.result).toContain("Readable tools: list_things.");
    }
    expect(execute).not.toHaveBeenCalled();
    expect(writeExecute).not.toHaveBeenCalled();
  });

  it("refuses a read-only tool that reaches outside the workspace, such as a LinkedIn or social provider search", async () => {
    const { tool, execute } = listTool("list_things", 3);
    const outside: McpTool = {
      ...tool,
      name: "linkedin_search_sales_leads",
      annotations: { readOnlyHint: true, openWorldHint: true },
    };
    const unannotated: McpTool = { ...tool, name: "get_unmarked", annotations: { readOnlyHint: true } };
    for (const name of [outside.name, unannotated.name]) {
      const outcome = await analyzeRecords(
        { reads: [read("list_things"), read(name)], code: "() => 1" },
        deps(tool, outside, unannotated),
      );
      expect(outcome.ok).toBe(false);
      expect(outcome.result).toContain(`${name} is not a read-only workspace tool`);
      expect(outcome.result).toContain("Readable tools: list_things.");
    }
    expect(execute).not.toHaveBeenCalled();
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
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    ["a grouped list", pagedRead("list_grouped", { groups: [{ label: large, count: 1 }] }), read("list_grouped")],
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

  it("applies the 8 MB data cap to UTF-8 bytes before running analysis", async () => {
    const response = { total: 1, items: [{ id: "row-1", notes: "😀".repeat(ANALYSIS_MAX_BYTES / 4) }] };
    const serialized = JSON.stringify(response);
    expect(serialized.length).toBeLessThan(ANALYSIS_MAX_BYTES);
    expect(Buffer.byteLength(serialized, "utf8")).toBeGreaterThan(ANALYSIS_MAX_BYTES);
    const tool = pagedRead("list_things", response);
    await expect(
      analyzeRecords({ reads: [read("list_things")], code: "(data) => data[0].items.length" }, deps(tool)),
    ).resolves.toEqual({ ok: false, result: TOO_MUCH_DATA });
  });

  it("accepts up to ten reads and states the limits it enforces", () => {
    const reads = (count: number) => Array.from({ length: count }, () => read("list_things"));
    expect(AnalyzeRecordsSchema.safeParse({ reads: reads(10), code: "() => 1" }).success).toBe(true);
    expect(AnalyzeRecordsSchema.safeParse({ reads: reads(11), code: "() => 1" }).success).toBe(false);
    expect(ANALYSIS_MAX_READS).toBe(10);
    expect(ANALYSIS_MAX_ROWS).toBe(10_000);
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain(
      "up to 10 read-only workspace tool calls (never LinkedIn or social provider tools)",
    );
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("up to 10,000 rows and 8 MB in total");
    expect(AnalyzeRecordsSchema.shape.reads.description).toMatch(/^One to 10 reads/);
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

  it("reads query_crm_records in its largest pages without adding inputs the read did not pass", async () => {
    listed.query.mockReset();
    const typeId = "00000000-0000-4000-8000-0000000000a1";
    const rows = Array.from({ length: 750 }, (_, index) =>
      record(typeId, `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, []),
    );
    listed.query.mockImplementation(pagedQuery(rows));
    const outcome = await analyzeRecords(
      { reads: [read("query_crm_records", { typeId })], code: "(data) => [data[0].records.length, data[0].total]" },
      deps(queryRecordsV2Tool as McpTool),
    );
    expect(outcome).toEqual({ ok: true, result: JSON.stringify({ rowsRead: 750, result: [750, 750] }) });
    expect(listed.query.mock.calls.map(([input]) => [input.page, input.pageSize, input.includeRelationships])).toEqual([
      [1, 500, undefined],
      [2, 500, undefined],
    ]);
  });

  it("joins two record types over typed query_crm_records rows with exact decimal strings", async () => {
    const dealType = "00000000-0000-4000-8000-0000000000d1";
    const taskType = "00000000-0000-4000-8000-0000000000e1";
    const dealTasks = "00000000-0000-4000-8000-0000000000f1";
    const amount = "00000000-0000-4000-8000-0000000000a2";
    const taskStatus = "1336405e-b7d6-5f21-a683-4af722371c89";
    const open = "1171e71e-4f98-5ac3-9364-11fd1730c223";
    const done = "5d2c6f0e-3a51-5b8e-9c47-8e1f0a6b2d93";
    const id = (prefix: string, index: number) => `00000000-0000-4000-${prefix}-${String(index).padStart(12, "0")}`;
    const tasks = Array.from({ length: 34 }, (_, index) =>
      record(taskType, id("8001", index + 1), [
        {
          fieldId: taskStatus,
          result: { state: "value", value: { kind: "select", value: index < 15 || index >= 30 ? open : done } },
        },
      ]),
    );
    const deals = Array.from({ length: 60 }, (_, index) =>
      record(
        dealType,
        id("8002", index + 1),
        [
          {
            fieldId: amount,
            result: { state: "value", value: { kind: "decimal", value: `${100 * (index + 1)}.00`, currency: "EUR" } },
          },
        ],
        [
          {
            relationId: dealTasks,
            direction: "outgoing",
            records:
              index < 30
                ? [{ ref: { typeId: taskType, recordId: id("8001", index + 1) }, title: { state: "missing" } }]
                : [],
            readableCount: index < 30 ? 1 : 0,
            hasMore: false,
          },
        ],
      ),
    );
    listed.query.mockImplementation((input: { typeId: string; page: number; pageSize: number }) =>
      pagedQuery(input.typeId === dealType ? deals : tasks)(input),
    );
    const reads = [
      read("query_crm_records", {
        typeId: dealType,
        fields: [amount],
        includeRelationships: [{ relationId: dealTasks, direction: "outgoing", limit: 25 }],
      }),
      read("query_crm_records", { typeId: taskType, fields: [taskStatus] }),
    ];
    const code = [
      "(data) => {",
      "  const status = {};",
      `  for (const task of data[1].records) status[task.ref.recordId] = task.fields.find((field) => field.fieldId === "${taskStatus}").result.value.value;`,
      "  let unblockedCount = 0; let blockedCount = 0; let unblockedTotal = 0;",
      "  for (const deal of data[0].records) {",
      "    const linked = deal.relationships[0].records.map((link) => link.ref.recordId);",
      `    if (linked.some((taskId) => status[taskId] === "${open}")) blockedCount++;`,
      `    else { unblockedCount++; unblockedTotal += Number(deal.fields.find((field) => field.fieldId === "${amount}").result.value.value); }`,
      "  }",
      "  return { unblockedCount, blockedCount, unblockedTotal };",
      "}",
    ].join("\n");
    await expect(analyzeRecords({ reads, code }, deps(queryRecordsV2Tool as McpTool))).resolves.toEqual({
      ok: true,
      result: JSON.stringify({
        rowsRead: 94,
        result: { unblockedCount: 45, blockedCount: 15, unblockedTotal: 171_000 },
      }),
    });
  });

  it("refuses a query_crm_records read whose relationship lists only part of its links", async () => {
    const typeId = "00000000-0000-4000-8000-0000000000d2";
    listed.query.mockImplementation(
      pagedQuery([
        record(
          typeId,
          "00000000-0000-4000-8000-000000000101",
          [],
          [
            {
              relationId: "00000000-0000-4000-8000-0000000000f2",
              direction: "outgoing",
              records: [],
              readableCount: 30,
              hasMore: true,
            },
          ],
        ),
      ]),
    );
    await expect(
      analyzeRecords(
        { reads: [read("query_crm_records", { typeId })], code: "(data) => data[0].records.length" },
        deps(queryRecordsV2Tool as McpTool),
      ),
    ).resolves.toEqual({
      ok: false,
      result:
        "query_crm_records returned a relationship that lists only part of its linked records, so the analysis did not run on a partial set. Read the linked type and join from its side instead. The analysis code was not run.",
    });
  });

  it("tells the model what a query_crm_records row carries and to prefer measures and grouping for figures per group", () => {
    for (const text of [
      "ref {typeId, recordId}",
      "fields [{fieldId, result}]",
      "decimal and currency values are exact strings",
      "a join, such as the deals that have an open task, is two query reads and one function",
      "get_record_model maps option ids to labels",
      "Pass fields with only the field ids the code needs",
      "prefer query_crm_measure or query_crm_records grouping with groupSummaries",
      "an empty records array means none you can see is linked",
      "hasMore is true holds only part of its links",
    ])
      expect(ANALYZE_RECORDS_DESCRIPTION).toContain(text);
    expect(ANALYZE_RECORDS_DESCRIPTION).not.toMatch(/list_records|get_record_schema|customFieldValues/);
  });

  it("tells the code that Date is undefined and dates are ISO strings, and names only the months groupBy groups by", async () => {
    const code = AnalyzeRecordsSchema.shape.code.description ?? "";
    for (const text of [ANALYZE_RECORDS_DESCRIPTION, code]) {
      expect(text).toContain("Date is undefined");
      expect(text).toContain("ISO strings to compare or slice as text");
      expect(text).toContain("value.slice(0, 7) for the month");
    }
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("createdAt, updatedAt and date values are ISO strings");
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

describe("analyze_records on a read that holds only part of its rows", () => {
  const NOT_RUN = "The analysis code was not run.";

  function fixedRead(name: string, shape: z.ZodRawShape, content: Record<string, unknown>) {
    const execute = vi.fn(() => ({ text: JSON.stringify(content), structuredContent: content }));
    const tool: McpTool = {
      name,
      title: name,
      description: name,
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: z.object(shape),
      execute: execute as never,
    };
    return { tool, execute };
  }

  describe("a read that pages by cursor or offset", () => {
    const cursorShape = {
      postId: z.string().optional(),
      cursor: z.string().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    };
    const comments = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `comment-${index}` }));
    const analyze = (tool: McpTool, input: Record<string, unknown>) =>
      analyzeRecords(
        { reads: [read(tool.name, input)], code: "(data) => data[0].items ? data[0].items.length : data[0].id" },
        deps(tool),
      );
    const morePossible = (name: string, rows: number) => ({
      ok: false,
      result: `${name} returned ${rows} rows and more may follow, so the analysis did not run on a partial set. Pass a limit above the row count, at most 100, or call ${name} directly and page through it. ${NOT_RUN}`,
    });
    const pageThrough = (name: string, rows: number) => ({
      ok: false,
      result: `${name} returned ${rows} rows and more may follow, so the analysis did not run on a partial set. Call ${name} directly and page through it. ${NOT_RUN}`,
    });
    function cappedRead(name: string, shape: z.ZodRawShape, rows: number, pageCap: number) {
      const all = comments(rows);
      const capped = fixedRead(name, shape, {});
      capped.execute.mockImplementation((({ offset = 0 }: { offset?: number }) => {
        const content = { next_cursor: null, items: all.slice(offset, offset + pageCap) };
        return { text: JSON.stringify(content), structuredContent: content };
      }) as never);
      return capped;
    }

    it("reads a list that fits on its first page, and a single object that has no list", async () => {
      const engagement = fixedRead("get_social_post_engagement", cursorShape, {
        total: 12,
        next_cursor: null,
        items: comments(12),
      });
      const post = fixedRead("get_social_posts", cursorShape, { id: "post-1", text: "Launch" });
      const leads = fixedRead("linkedin_search_sales_leads", cursorShape, {
        total: 7,
        next_offset: 7,
        items: comments(7),
      });
      const counted = fixedRead("get_social_post_engagement", cursorShape, {
        total: 100,
        next_cursor: null,
        items: comments(100),
      });

      await expect(analyze(engagement.tool, { postId: "post-1", limit: 100 })).resolves.toEqual({
        ok: true,
        result: JSON.stringify({ rowsRead: 0, result: 12 }),
      });
      await expect(analyze(counted.tool, { postId: "post-1", limit: 100 })).resolves.toEqual({
        ok: true,
        result: JSON.stringify({ rowsRead: 0, result: 100 }),
      });
      expect(engagement.execute).toHaveBeenCalledOnce();
      expect(counted.execute).toHaveBeenCalledOnce();
      await expect(analyze(post.tool, { postId: "post-1" })).resolves.toEqual({
        ok: true,
        result: JSON.stringify({ rowsRead: 0, result: "post-1" }),
      });
      await expect(analyze(leads.tool, {})).resolves.toEqual({
        ok: true,
        result: JSON.stringify({ rowsRead: 0, result: 7 }),
      });
    });

    it("refuses a first page that says or may hide more rows", async () => {
      const cursored = fixedRead("get_social_post_engagement", cursorShape, {
        total: 12,
        next_cursor: "cursor-2",
        items: comments(12),
      });
      const full = fixedRead("get_social_post_engagement", cursorShape, { next_cursor: null, items: comments(100) });
      const defaultLimit = fixedRead("linkedin_search_sales_leads", cursorShape, {
        next_offset: 10,
        items: comments(10),
      });
      const counted = fixedRead("get_social_posts", cursorShape, { total: 40, next_cursor: null, items: comments(7) });

      await expect(analyze(cursored.tool, { postId: "post-1", limit: 100 })).resolves.toEqual(
        pageThrough("get_social_post_engagement", 12),
      );
      await expect(analyze(full.tool, { postId: "post-1", limit: 100 })).resolves.toEqual(
        pageThrough("get_social_post_engagement", 100),
      );
      await expect(analyze(defaultLimit.tool, {})).resolves.toEqual(morePossible("linkedin_search_sales_leads", 10));
      expect(full.execute).toHaveBeenLastCalledWith({ postId: "post-1", offset: 100, limit: 100 });
      expect(defaultLimit.execute).toHaveBeenLastCalledWith({ offset: 10, limit: 10 });
      await expect(analyze(counted.tool, { limit: 100 })).resolves.toEqual({
        ok: false,
        result: `get_social_posts returned 7 of 40 rows, so the analysis did not run on a partial set. ${NOT_RUN}`,
      });
    });

    it("reads past a short page without a total, and runs only when that read comes back empty", async () => {
      const whole = cappedRead("get_social_post_engagement", cursorShape, 50, 50);
      const capped = cappedRead("get_social_post_engagement", cursorShape, 180, 50);
      const empty = cappedRead("get_social_post_engagement", cursorShape, 0, 50);
      const totalled = { code: "(data) => ({ total: data[0].total, rows: data[0].items.length })" };

      await expect(
        analyzeRecords(
          { reads: [read(whole.tool.name, { postId: "post-1", limit: 100 })], ...totalled },
          deps(whole.tool),
        ),
      ).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 0, result: { total: 50, rows: 50 } }) });
      expect(whole.execute.mock.calls).toEqual([
        [{ postId: "post-1", limit: 100 }],
        [{ postId: "post-1", offset: 50, limit: 100 }],
      ]);
      await expect(analyze(capped.tool, { postId: "post-1", limit: 100 })).resolves.toEqual(
        pageThrough("get_social_post_engagement", 50),
      );
      await expect(
        analyzeRecords({ reads: [read(empty.tool.name, { postId: "post-1" })], ...totalled }, deps(empty.tool)),
      ).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 0, result: { total: 0, rows: 0 } }) });
      expect(empty.execute).toHaveBeenCalledOnce();
    });

    it("refuses a short page without a total when the tool takes no offset or the read past it fails", async () => {
      const cursorOnly = cappedRead(
        "get_social_post_engagement",
        { postId: z.string().optional(), cursor: z.string().optional(), limit: z.number().optional() },
        50,
        50,
      );
      const failing = fixedRead("get_social_posts", cursorShape, {});
      failing.execute.mockImplementation(((input: { offset?: number }) =>
        input.offset === undefined
          ? { text: "posts", structuredContent: { next_cursor: null, items: comments(20) } }
          : "Validation error: authorIdentifier is required with offset.") as never);

      await expect(analyze(cursorOnly.tool, { postId: "post-1", limit: 100 })).resolves.toEqual(
        pageThrough("get_social_post_engagement", 50),
      );
      expect(cursorOnly.execute).toHaveBeenCalledOnce();
      await expect(analyze(failing.tool, { limit: 100 })).resolves.toEqual({
        ok: false,
        result: `get_social_posts returned 20 rows and no total, and the read at offset 20 that checks for more failed, so the analysis did not run on a partial set. get_social_posts: Validation error: authorIdentifier is required with offset. ${NOT_RUN}`,
      });
    });

    it("never calls the real social engagement tool, which reaches a provider outside the workspace", async () => {
      const engagement = {
        reads: [
          read(getSocialPostEngagementTool.name, {
            connectedAccountId: "00000000-0000-4000-8000-000000000001",
            postId: "post-1",
            kind: "reactions",
            limit: 100,
          }),
        ],
        code: "(data) => data[0].items.length",
      };

      expect(getSocialPostEngagementTool.annotations.openWorldHint).toBe(true);
      await expect(analyzeRecords(engagement, deps(getSocialPostEngagementTool))).resolves.toEqual({
        ok: false,
        result: `${getSocialPostEngagementTool.name} is not a read-only workspace tool this analysis can call. Nothing was run. Readable tools: .`,
      });
      expect(listed.reactions).not.toHaveBeenCalled();
    });

    it("refuses a read that starts past the first page before it runs", async () => {
      const { tool, execute } = fixedRead("get_social_post_engagement", cursorShape, {
        total: 3,
        next_cursor: null,
        items: comments(3),
      });

      for (const [input, name] of [
        [{ postId: "post-1", cursor: "cursor-2" }, "cursor"],
        [{ postId: "post-1", offset: 20 }, "offset"],
      ] as const) {
        await expect(analyze(tool, input), name).resolves.toEqual({
          ok: false,
          result: `get_social_post_engagement starts past its first page when cursor or offset is set, so the analysis did not run on a partial set. Drop cursor and offset. ${NOT_RUN}`,
        });
      }
      expect(execute).not.toHaveBeenCalled();
    });
  });

  it("refuses a read that takes no pages when it returns fewer rows than its total, in a list or in a nested one", async () => {
    const top = fixedRead(
      "get_things",
      { query: z.string().optional() },
      {
        total: 2_500,
        items: Array.from({ length: 10 }, (_, index) => ({ id: `${index}` })),
      },
    );
    const nested = fixedRead(
      "search_records",
      { searchTerm: z.string().optional() },
      {
        searchTerm: "Atlas",
        results: [
          { entity: "contact", total: 1, items: [{ id: "c" }] },
          { entity: "deal", total: 300, items: Array.from({ length: 5 }, (_, index) => ({ id: `${index}` })) },
        ],
      },
    );
    const whole = fixedRead(
      "search_records",
      { searchTerm: z.string().optional() },
      {
        searchTerm: "Atlas",
        results: [{ entity: "deal", total: 2, items: [{ id: "a" }, { id: "b" }] }],
      },
    );

    await expect(analyzeRecords({ reads: [read("get_things")], code: "(data) => 1" }, deps(top.tool))).resolves.toEqual(
      {
        ok: false,
        result: `get_things returned 10 of 2500 rows, so the analysis did not run on a partial set. ${NOT_RUN}`,
      },
    );
    await expect(
      analyzeRecords({ reads: [read("search_records")], code: "(data) => 1" }, deps(nested.tool)),
    ).resolves.toEqual({
      ok: false,
      result: `search_records returned 5 of 300 rows, so the analysis did not run on a partial set. ${NOT_RUN}`,
    });
    await expect(
      analyzeRecords(
        { reads: [read("search_records")], code: "(data) => data[0].results[0].items.length" },
        deps(whole.tool),
      ),
    ).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 0, result: 2 }) });
  });

  it("refuses a grouped query_crm_records read that holds only part of some groups, and takes a complete one", async () => {
    listed.query.mockReset();
    const typeId = "00000000-0000-4000-8000-0000000000d3";
    const group = (index: number, partial: { hasMore?: boolean; materialised?: boolean } = {}) => ({
      key: `value:${index}`,
      count: 3,
      labelKind: "value",
      isNoValue: false,
      materialised: partial.materialised ?? true,
      itemIds: [],
      hasMore: partial.hasMore ?? false,
    });
    const grouped = (groups: ReturnType<typeof group>[], partial = false) =>
      listed.query.mockResolvedValue({
        ok: true,
        data: {
          records: [],
          total: groups.length * 3,
          page: 1,
          pageSize: 500,
          schemaRevision: 1,
          grouping: {
            grouping: { field: "00000000-0000-4000-8000-0000000000c3" },
            kind: "customSingleSelect",
            supportsDragWriteBack: false,
            total: groups.length * 3,
            membershipTotal: groups.length * 3,
            ...(partial ? { partial: true } : {}),
            groups,
          },
        },
      });
    const analyze = () =>
      analyzeRecords(
        {
          reads: [read("query_crm_records", { typeId, grouping: { field: "00000000-0000-4000-8000-0000000000c3" } })],
          code: "(data) => data[0].grouping.groups.length",
        },
        deps(queryRecordsV2Tool as McpTool),
      );
    const refused = {
      ok: false,
      result: `query_crm_records returned only some groups or only part of some groups' records, so the analysis did not run on a partial set. Read the records without grouping and group them in the code. ${NOT_RUN}`,
    };

    grouped([group(1), group(2, { hasMore: true })]);
    await expect(analyze()).resolves.toEqual(refused);
    grouped([group(1), group(2, { materialised: false })]);
    await expect(analyze()).resolves.toEqual(refused);
    grouped([group(1)], true);
    await expect(analyze()).resolves.toEqual(refused);
    grouped([group(1), group(2)]);
    await expect(analyze()).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 0, result: 2 }) });
    expect(listed.query).toHaveBeenCalledTimes(4);
  });

  it("refuses an activity read that left out every contact source because its scope reached too many contacts", async () => {
    const execute = vi.fn(({ page, pageSize }: { page: number; pageSize: number }) => {
      const payload = {
        total: 30,
        page,
        pageSize,
        items: Array.from({ length: 30 }, (_, index) => ({ id: `audit-${index}`, kind: "audit" })),
        pageLimitReached: false,
        scopeTruncated: true,
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    });
    const activities: McpTool = {
      name: "get_activities",
      title: "activities",
      description: "activities",
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: z.object({ page: z.number().default(1), pageSize: z.number().default(25) }),
      execute: execute as never,
    };

    await expect(
      analyzeRecords({ reads: [read("get_activities")], code: "(data) => data[0].items.length" }, deps(activities)),
    ).resolves.toEqual({
      ok: false,
      result: `get_activities left out every message, activity and calendar event because its filters or scope reach too many contacts. Narrow them. ${NOT_RUN}`,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("refuses after the first page a read whose total its page limit cannot reach, and reads one it can", async () => {
    const capped = (rows: number) => {
      const { tool, execute } = listTool("get_activities", rows);
      const bounded = {
        ...tool,
        inputSchema: z.object({
          page: z.coerce.number().int().min(1).max(40).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
        }),
      };
      return { tool: bounded, execute };
    };
    const over = capped(4_500);
    await expect(
      analyzeRecords({ reads: [read("get_activities")], code: "(data) => data[0].items.length" }, deps(over.tool)),
    ).resolves.toEqual({
      ok: false,
      result: `get_activities matched 4500 rows, more than the 4000 its page limit lets one analysis read. Narrow its filters. ${NOT_RUN}`,
    });
    expect(over.execute).toHaveBeenCalledTimes(1);

    const within = capped(4_000);
    await expect(
      analyzeRecords({ reads: [read("get_activities")], code: "(data) => data[0].items.length" }, deps(within.tool)),
    ).resolves.toEqual({ ok: true, result: JSON.stringify({ rowsRead: 4_000, result: 4_000 }) });
    expect(within.execute).toHaveBeenCalledTimes(40);
  });

  it("refuses a read that reports its page limit on a later page", async () => {
    const execute = vi.fn(({ page, pageSize }: { page: number; pageSize: number }) => {
      const payload = {
        total: 300,
        page,
        pageSize,
        items: Array.from({ length: pageSize }, (_, index) => ({ id: `${page}-${index}` })),
        pageLimitReached: page >= 2,
      };
      return { text: JSON.stringify(payload), structuredContent: payload };
    });
    const tool: McpTool = {
      name: "get_activities",
      title: "activities",
      description: "activities",
      annotations: { readOnlyHint: true, openWorldHint: false },
      inputSchema: z.object({ page: z.number().default(1), pageSize: z.number().default(25) }),
      execute: execute as never,
    };

    await expect(analyzeRecords({ reads: [read("get_activities")], code: "() => 1" }, deps(tool))).resolves.toEqual({
      ok: false,
      result: `get_activities stopped at its page limit before every row was read. Narrow its filters. ${NOT_RUN}`,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("tells the code that calculated, restricted, missing and failed values are distinct states", () => {
    expect(ANALYZE_RECORDS_DESCRIPTION).toContain("or a missing, restricted or error state");
  });
});
