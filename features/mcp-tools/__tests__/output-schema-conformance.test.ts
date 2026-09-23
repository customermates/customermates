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
  listDeals: vi.fn(),
  getUsers: vi.fn(),
  getMessagingThreads: vi.fn(),
  getMessagingThread: vi.fn(),
  getActivities: vi.fn(),
  getCalendars: vi.fn(),
  getCalendarEvents: vi.fn(),
  getRoutines: vi.fn(),
  getWebhooks: vi.fn(),
  getWebhookDeliveries: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetUsersApiInteractor: () => ({ invoke: spies.getUsers }),
  getGetMessagingThreadsApiInteractor: () => ({ invoke: spies.getMessagingThreads }),
  getGetMessagingThreadInteractor: () => ({ invoke: spies.getMessagingThread }),
  getGetActivitiesApiInteractor: () => ({ invoke: spies.getActivities }),
  getGetCalendarsApiInteractor: () => ({ invoke: spies.getCalendars }),
  getGetCalendarEventsApiInteractor: () => ({ invoke: spies.getCalendarEvents }),
  getGetRoutinesApiInteractor: () => ({ invoke: spies.getRoutines }),
  getGetWebhooksApiInteractor: () => ({ invoke: spies.getWebhooks }),
  getGetWebhookDeliveriesApiInteractor: () => ({ invoke: spies.getWebhookDeliveries }),
}));
vi.mock("@/features/search/entity-list-executors", () => ({
  entityListExecutors: { deal: spies.listDeals },
  entityNameExtractors: { deal: (item: { name: string }) => item.name },
}));

import { executeMcpTool, type McpTool } from "../mcp-tool";
import { listRecordsTool } from "../entity-generic.mcp-tools";
import { listUsersTool } from "../workspace.mcp-tools";
import { getActivitiesTool, getCalendarsTool, getMessagingThreadsTool } from "../messaging.mcp-tools";
import { manageRoutinesTool } from "../routine.mcp-tools";
import { manageWebhooksTool } from "../webhook.mcp-tools";

const ada = "00000000-0000-4000-8000-00000000000a";
const threadId = "00000000-0000-4000-8000-000000000071";
const accountId = "00000000-0000-4000-8000-000000000072";
const sentAt = new Date("2026-09-01T06:55:15.000Z");

const participant = {
  attendeeId: "attendee-1",
  displayName: "Jane Doe",
  identifier: "jane@example.com",
  isSelf: false,
  contact: { id: "00000000-0000-4000-8000-000000000073", firstName: "Jane", lastName: "Doe" },
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
  participants: [participant],
  sharedToCrm: false,
  isOwner: true,
};

const deal = { id: "00000000-0000-4000-8000-000000000081", name: "Rollout", totalValue: 1000, totalQuantity: 2 };

function page<T>(items: T[]) {
  return { ok: true, data: { items, pagination: { page: 1, pageSize: 25, total: items.length, totalPages: 1 } } };
}

function arrange() {
  spies.listDeals.mockImplementation((params: { grouping?: unknown }) =>
    Promise.resolve({
      ok: true,
      data: {
        items: params.grouping ? [] : [{ ...deal, weightedValue: 500 }],
        pagination: { total: 2 },
        valueSums: { totalValue: 3000, weightedValue: 1500 },
        ...(params.grouping
          ? {
              grouping: {
                grouping: { field: "userIds" },
                kind: "relation",
                supportsDragWriteBack: false,
                total: 2,
                membershipTotal: 3,
                groups: [
                  {
                    key: ada,
                    count: 2,
                    labelKind: "value",
                    label: "Ada Tester",
                    isNoValue: false,
                    materialised: false,
                    itemIds: [],
                    hasMore: false,
                    valueSums: { totalValue: 3000, weightedValue: 1500 },
                  },
                ],
              },
            }
          : {}),
      },
    }),
  );
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
  spies.getActivities.mockResolvedValue({
    ok: true,
    data: {
      availableSources: [],
      items: [{ kind: "audit", id: "activity-1", at: sentAt, records: {} }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      pageLimitReached: false,
      scopeTruncated: false,
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
    ["list_records", listRecordsTool, { entity: "deal" }],
    ["list_records grouped", listRecordsTool, { entity: "deal", groupBy: { field: "userIds" } }],
    ["list_records with a lowered page size", listRecordsTool, { entity: "deal", pageSize: 50 }],
    [
      "list_records grouped with a lowered page size",
      listRecordsTool,
      { entity: "deal", pageSize: 50, groupBy: { field: "userIds" } },
    ],
    ["list_users", listUsersTool, {}],
    ["list_users with a lowered page size", listUsersTool, { pageSize: 50 }],
    ["get_messaging_threads list with a lowered page size", getMessagingThreadsTool, { pageSize: 7 }],
    ["get_messaging_threads detail with a lowered page size", getMessagingThreadsTool, { threadId, pageSize: 7 }],
    ["get_activities with a lowered page size", getActivitiesTool, { pageSize: 7 }],
    ["get_calendars calendars with a lowered page size", getCalendarsTool, { pageSize: 7 }],
    ["get_calendars events with a lowered page size", getCalendarsTool, { list: "events", pageSize: 7 }],
    ["manage_routines list with a lowered page size", manageRoutinesTool, { action: "list", pageSize: 7 }],
    ["manage_webhooks list with a lowered page size", manageWebhooksTool, { action: "list", pageSize: 7 }],
    [
      "manage_webhooks list_deliveries with a lowered page size",
      manageWebhooksTool,
      { action: "list_deliveries", pageSize: 7 },
    ],
  ] as const)("%s", async (_case, tool, args) => {
    const outcome = await sdkOutputViolations(tool as McpTool, args);

    expect({ server: outcome.server, client: outcome.client }).toEqual({ server: null, client: null });
    if ("pageSize" in args) {
      expect(outcome.structuredContent).toMatchObject({
        requestedPageSize: args.pageSize,
        pageSizeNote: expect.any(String),
      });
    }
  });

  it("reports the page and the applied page size on a grouped list_records call", async () => {
    const outcome = await sdkOutputViolations(listRecordsTool, {
      entity: "deal",
      page: 2,
      pageSize: 50,
      groupBy: { field: "userIds" },
    });

    expect(outcome.structuredContent).toMatchObject({ page: 2, pageSize: 25, requestedPageSize: 50 });
  });
});
