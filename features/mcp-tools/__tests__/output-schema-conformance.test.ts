import { beforeEach, describe, expect, it, vi } from "vitest";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import {
  getParseErrorMessage,
  normalizeObjectSchema,
  safeParseAsync,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  getUsers: vi.fn(),
  getMessagingThreads: vi.fn(),
  getMessagingThread: vi.fn(),
  getCalendars: vi.fn(),
  getCalendarEvents: vi.fn(),
  getRoutines: vi.fn(),
  getWebhooks: vi.fn(),
  getWebhookDeliveries: vi.fn(),
  queryMeasure: vi.fn(),
  resolveIdentities: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetUsersApiInteractor: () => ({ invoke: spies.getUsers }),
  getGetMessagingThreadsApiInteractor: () => ({ invoke: spies.getMessagingThreads }),
  getGetMessagingThreadInteractor: () => ({ invoke: spies.getMessagingThread }),
  getGetCalendarsApiInteractor: () => ({ invoke: spies.getCalendars }),
  getGetCalendarEventsApiInteractor: () => ({ invoke: spies.getCalendarEvents }),
  getGetRoutinesApiInteractor: () => ({ invoke: spies.getRoutines }),
  getGetWebhooksApiInteractor: () => ({ invoke: spies.getWebhooks }),
  getGetWebhookDeliveriesApiInteractor: () => ({ invoke: spies.getWebhookDeliveries }),
  getQueryRecordMeasureInteractor: () => ({ invoke: spies.queryMeasure }),
  getResolveRecordIdentitiesInteractor: () => ({ invoke: spies.resolveIdentities }),
}));

import { executeMcpTool, type McpTool } from "../mcp-tool";
import { McpPageOutputShape } from "../utils";
import { listUsersTool } from "../workspace.mcp-tools";
import { getCalendarsTool, getMessagingThreadsTool } from "../messaging.mcp-tools";
import { manageRoutinesTool } from "../routine.mcp-tools";
import { manageWebhooksTool } from "../webhook.mcp-tools";
import { queryRecordMeasureV2Tool, resolveRecordIdentifiersV2Tool } from "../record-model.mcp-tools";

const ada = "00000000-0000-4000-8000-00000000000a";
const threadId = "00000000-0000-4000-8000-000000000071";
const accountId = "00000000-0000-4000-8000-000000000072";
const sentAt = new Date("2026-09-01T06:55:15.000Z");

const participant = {
  attendeeId: "attendee-1",
  displayName: "Jane Doe",
  identifier: "jane@example.com",
  isSelf: false,
  records: [
    {
      ref: { typeId: "00000000-0000-4000-8000-000000000075", recordId: "00000000-0000-4000-8000-000000000073" },
      typeLabel: "Contact",
      typePluralLabel: "Contacts",
      title: "Jane Doe",
      avatarUrl: null,
      canEdit: true,
    },
  ],
};

const thread = {
  id: threadId,
  connectedAccountId: accountId,
  provider: "gmail",
  type: "single",
  name: null,
  subject: "Pilot",
  preview: "Sounds good",
  state: "read",
  lastMessageAt: sentAt,
  lastMessageFromSelf: false,
  lastSentMessageFromSelf: false,
  participants: [participant],
  sharedToCrm: false,
  isOwner: true,
};

function page<T>(items: T[]) {
  return { ok: true, data: { items, pagination: { page: 1, pageSize: 25, total: items.length, totalPages: 1 } } };
}

function arrange() {
  spies.getUsers.mockResolvedValue(
    page([
      {
        id: ada,
        firstName: "Ada",
        lastName: "Tester",
        email: "ada@example.com",
        roleId: null,
        status: "active",
        createdAt: sentAt,
      },
    ]),
  );
  spies.getMessagingThreads.mockResolvedValue(page([thread]));
  spies.getMessagingThread.mockResolvedValue({
    ok: true,
    data: {
      thread,
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000074",
          direction: "inbound",
          sender: participant,
          recipients: { to: [], cc: [], bcc: [] },
          subject: "Pilot",
          bodyText: "Sounds good",
          isDraft: false,
          draftRevision: null,
          attachmentsMeta: [],
          sentAt,
          editedAt: null,
        },
      ],
      total: 1,
      accountOwners: {},
      folderContext: null,
    },
  });
  spies.getCalendars.mockResolvedValue(page([{ id: "calendar-1", name: "Work" }]));
  spies.getCalendarEvents.mockResolvedValue(page([{ id: "event-1", title: "Kickoff", startsAt: sentAt }]));
  spies.getRoutines.mockResolvedValue(page([{ id: "routine-1", name: "Digest" }]));
  spies.getWebhooks.mockResolvedValue(
    page([
      {
        id: "webhook-1",
        url: "https://example.com/hook",
        description: null,
        events: ["contact.created"],
        enabled: true,
        createdAt: sentAt,
        updatedAt: sentAt,
      },
    ]),
  );
  spies.getWebhookDeliveries.mockResolvedValue(page([{ id: "delivery-1", createdAt: sentAt }]));
}

async function sdkOutputViolations(tool: McpTool, args: Record<string, unknown>) {
  const executed = await executeMcpTool(tool, [tool.inputSchema.parse(args)]);
  if (!executed.ok) throw new Error(executed.result);
  if (!executed.structuredContent) throw new Error(`${tool.name} returned no structured content`);

  const outputSchema = normalizeObjectSchema(tool.outputSchema);
  if (!outputSchema) throw new Error(`${tool.name} declares no object output schema`);

  const server = await safeParseAsync(outputSchema, executed.structuredContent);
  const published = JSON.parse(
    JSON.stringify(toJsonSchemaCompat(outputSchema, { strictUnions: true, pipeStrategy: "output" })),
  );
  const client = new AjvJsonSchemaValidator().getValidator(published)(
    JSON.parse(JSON.stringify(executed.structuredContent)),
  );

  return {
    structuredContent: executed.structuredContent,
    server: server.success ? null : getParseErrorMessage(server.error),
    client: client.valid ? null : client.errorMessage,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  arrange();
});

describe("tool results pass the MCP SDK output validation on the server and in the client", () => {
  it.each([
    ["list_users", listUsersTool, {}],
    ["list_users served at a page size that is not offered", listUsersTool, { pageSize: 50 }],
    ["get_messaging_threads list served at a page size that is not offered", getMessagingThreadsTool, { pageSize: 7 }],
    [
      "get_messaging_threads detail served at a page size that is not offered",
      getMessagingThreadsTool,
      { threadId, pageSize: 7 },
    ],
    ["get_calendars calendars served at a page size that is not offered", getCalendarsTool, { pageSize: 7 }],
    [
      "get_calendars events served at a page size that is not offered",
      getCalendarsTool,
      { list: "events", pageSize: 7 },
    ],
    [
      "manage_routines list served at a page size that is not offered",
      manageRoutinesTool,
      { action: "list", pageSize: 7 },
    ],
    [
      "manage_webhooks list served at a page size that is not offered",
      manageWebhooksTool,
      { action: "list", pageSize: 7 },
    ],
    [
      "manage_webhooks list_deliveries served at a page size that is not offered",
      manageWebhooksTool,
      { action: "list_deliveries", pageSize: 7 },
    ],
  ] as const)("%s", async (_case, tool, args) => {
    const outcome = await sdkOutputViolations(tool as McpTool, args);

    expect({ server: outcome.server, client: outcome.client }).toEqual({ server: null, client: null });
    expect(outcome.structuredContent).toMatchObject({ page: 1, pageSize: "pageSize" in args ? args.pageSize : 25 });
    expect(outcome.structuredContent).not.toHaveProperty("requestedPageSize");
    expect(outcome.structuredContent).not.toHaveProperty("pageSizeNote");
  });

  it("publishes record versions and the schema revision for an identifier batch update", async () => {
    const reference = { ...participant.records[0], identityId: "00000000-0000-4000-8000-000000000076", version: 4 };
    const identifiers = [
      { provider: "mail", value: "jane@example.com" },
      { provider: "linkedin", value: "jane-doe" },
    ];
    spies.resolveIdentities.mockResolvedValue({
      ok: true,
      data: {
        schemaRevision: 7,
        matches: identifiers.map((identifier) => ({ ...identifier, records: [reference] })),
      },
    });
    const outcome = await sdkOutputViolations(resolveRecordIdentifiersV2Tool as McpTool, { identifiers });
    expect({ server: outcome.server, client: outcome.client }).toEqual({ server: null, client: null });
    expect(outcome.structuredContent).toMatchObject({
      schemaRevision: 7,
      matches: [{ records: [{ ref: reference.ref, version: 4 }] }, { records: [{ ref: reference.ref, version: 4 }] }],
    });
    spies.resolveIdentities.mockResolvedValue({
      ok: true,
      data: { matches: [{ ...identifiers[0], records: [participant.records[0]] }] },
    });
    const unversioned = await sdkOutputViolations(resolveRecordIdentifiersV2Tool as McpTool, { identifiers });
    expect(unversioned.server).not.toBeNull();
    expect(unversioned.client).not.toBeNull();
    expect(resolveRecordIdentifiersV2Tool.description).toMatch(/deduplicate by ref/);
    expect(resolveRecordIdentifiersV2Tool.description).toMatch(/updateMany/);
    expect(() =>
      resolveRecordIdentifiersV2Tool.inputSchema.parse({
        identifiers: Array.from({ length: 1001 }, () => identifiers[0]),
      }),
    ).toThrow();
  });

  it("validates time-series and assignee measure results against the published schema", async () => {
    const typeId = "00000000-0000-4000-8000-000000000081";
    const fieldId = "00000000-0000-4000-8000-000000000082";
    const count = (value: string) => ({ state: "value", value: { kind: "decimal", value, currency: null } });
    spies.queryMeasure.mockResolvedValue({
      ok: true,
      data: {
        schemaRevision: 3,
        attribution: "full",
        total: { count: 4, result: count("4") },
        groups: [
          {
            record: null,
            fieldId,
            label: { state: "value", value: { kind: "date", value: "2026-12-28" } },
            count: 2,
            result: count("2"),
          },
          {
            record: null,
            fieldId,
            label: { state: "value", value: { kind: "date", value: "2027-01-04" } },
            count: 1,
            result: count("1"),
          },
          { record: null, fieldId: null, label: { state: "missing" }, count: 1, result: count("1") },
        ],
      },
    });
    const input = {
      source: { typeId },
      aggregation: "count",
      valueFieldId: null,
      groupBy: { path: [], fieldId, dateInterval: "week", timeZone: "Europe/Berlin" },
      groupLimit: 1000,
    };
    const outcome = await sdkOutputViolations(queryRecordMeasureV2Tool as McpTool, input);
    expect({ server: outcome.server, client: outcome.client }).toEqual({ server: null, client: null });
    expect(spies.queryMeasure).toHaveBeenCalledWith(
      expect.objectContaining({
        groupBy: expect.objectContaining({ dateInterval: "week", timeZone: "Europe/Berlin" }),
      }),
    );
    spies.queryMeasure.mockResolvedValue({
      ok: true,
      data: {
        schemaRevision: 3,
        attribution: "full",
        total: { count: 2, result: count("2") },
        groups: [
          {
            record: null,
            fieldId: "system:assignedTo",
            label: { state: "value", value: { kind: "member", value: ada } },
            count: 2,
            result: count("2"),
          },
        ],
      },
    });
    const assignees = await sdkOutputViolations(queryRecordMeasureV2Tool as McpTool, {
      ...input,
      groupBy: { path: [], fieldId: "system:assignedTo" },
    });
    expect({ server: assignees.server, client: assignees.client }).toEqual({ server: null, client: null });
    expect(() =>
      queryRecordMeasureV2Tool.inputSchema.parse({
        ...input,
        groupBy: { ...input.groupBy, dateInterval: "fortnight" },
      }),
    ).toThrow();
    expect(() =>
      queryRecordMeasureV2Tool.inputSchema.parse({ ...input, groupBy: { ...input.groupBy, timeZone: "+02:00" } }),
    ).toThrow();
  });

  it("asks each list reader only for an offered page size, and hands a thread detail its size unchanged", async () => {
    const calls: [McpTool, Record<string, unknown>][] = [
      [listUsersTool, { pageSize: 50 }],
      [getMessagingThreadsTool, { pageSize: 7 }],
      [getMessagingThreadsTool, { threadId, pageSize: 7 }],
      [getCalendarsTool, { pageSize: 7 }],
      [getCalendarsTool, { list: "events", pageSize: 7 }],
      [manageRoutinesTool, { action: "list", pageSize: 7 }],
      [manageWebhooksTool, { action: "list", pageSize: 7 }],
      [manageWebhooksTool, { action: "list_deliveries", pageSize: 7 }],
    ];
    for (const [tool, args] of calls) await executeMcpTool(tool, [tool.inputSchema.parse(args)]);
    const paginations = (spy: ReturnType<typeof vi.fn>) =>
      spy.mock.calls.map(([params]) => (params as { pagination: unknown }).pagination);

    expect(paginations(spies.getUsers)).toEqual([{ page: 1, pageSize: 100 }]);
    for (const spy of [
      spies.getMessagingThreads,
      spies.getCalendars,
      spies.getCalendarEvents,
      spies.getWebhooks,
      spies.getWebhookDeliveries,
    ])
      expect(paginations(spy)).toEqual([{ page: 1, pageSize: 10 }]);
    expect(spies.getRoutines).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(spies.getMessagingThread).toHaveBeenCalledWith({ threadId, page: 1, pageSize: 7 });
  });

  it("publishes the shared page-size description on list_users", () => {
    const publishedPageSize = (tool: McpTool) => {
      const outputSchema = normalizeObjectSchema(tool.outputSchema);
      if (!outputSchema) throw new Error(`${tool.name} declares no object output schema`);
      const published = toJsonSchemaCompat(outputSchema, { strictUnions: true, pipeStrategy: "output" }) as {
        properties: { pageSize: { description?: string } };
      };
      return published.properties.pageSize.description;
    };
    const shared = McpPageOutputShape.pageSize.description;

    expect(publishedPageSize(listUsersTool as McpTool)).toBe(shared);
  });
});
