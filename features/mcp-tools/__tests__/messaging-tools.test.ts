import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { WidgetKind } from "@/generated/prisma";
import { ActivityWidgetDtoSchema } from "@/features/widget/widget.schema";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  createAuthLink: vi.fn(),
  getActivities: vi.fn(),
  getMessagingThread: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getCreateAuthLinkInteractor: () => ({ invoke: spies.createAuthLink }),
  getGetActivitiesApiInteractor: () => ({ invoke: spies.getActivities }),
  getGetMessagingThreadInteractor: () => ({ invoke: spies.getMessagingThread }),
}));

import {
  connectMessagingAccountTool,
  getActivitiesTool,
  getCalendarsTool,
  getMessagingThreadsTool,
} from "../messaging.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";

function run(args: Record<string, unknown>) {
  return connectMessagingAccountTool.execute(connectMessagingAccountTool.inputSchema.parse(args));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connect_messaging_account", () => {
  it("returns the hosted-auth url for the requested channel", async () => {
    spies.createAuthLink.mockResolvedValue({
      redirect: "https://auth.example.com/link-abc",
    });
    const result = await run({ channel: "whatsapp" });
    expect(spies.createAuthLink).toHaveBeenCalledWith({ channel: "whatsapp" });
    expect(mcpToolResultText(result)).toContain("https://auth.example.com/link-abc");
  });

  it("surfaces an interactor gate failure as a clean validation error", async () => {
    const parsed = z.object({ channel: z.string() }).safeParse({});
    const error = parsed.success ? undefined : parsed.error;
    spies.createAuthLink.mockResolvedValue({ ok: false, error });
    const result = await run({ channel: "google" });
    expect(mcpToolResultText(result)).toContain("Validation error:");
  });

  it("rejects an unknown channel at the schema boundary", () => {
    expect(() => connectMessagingAccountTool.inputSchema.parse({ channel: "myspace" })).toThrow();
    expect(spies.createAuthLink).not.toHaveBeenCalled();
  });
});

describe("get_activities", () => {
  it("passes a multi-record scope to the API interactor", async () => {
    const dealId = "00000000-0000-4000-8000-000000000001";
    const taskId = "00000000-0000-4000-8000-000000000002";
    spies.getActivities.mockResolvedValue({
      ok: true,
      data: {
        items: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
        scopeTruncated: false,
      },
    });

    await getActivitiesTool.execute(
      getActivitiesTool.inputSchema.parse({
        scope: {
          records: [
            { entityType: "deal", ids: [dealId] },
            { entityType: "task", ids: [taskId] },
          ],
        },
      }),
    );

    expect(spies.getActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: {
          records: [
            { entityType: "deal", ids: [dealId] },
            { entityType: "task", ids: [taskId] },
          ],
        },
      }),
    );
  });

  it("passes low-level scope and relationship filters together unchanged", async () => {
    const dealId = "00000000-0000-4000-8000-000000000001";
    const contactId = "00000000-0000-4000-8000-000000000002";
    const filters = [{ field: "contactIds", operator: "in", value: [contactId] }];
    spies.getActivities.mockResolvedValue({
      ok: true,
      data: {
        items: [],
        pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
        scopeTruncated: false,
      },
    });

    await getActivitiesTool.execute(
      getActivitiesTool.inputSchema.parse({
        scope: { records: [{ entityType: "deal", ids: [dealId] }] },
        filters,
      }),
    );

    expect(spies.getActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { records: [{ entityType: "deal", ids: [dealId] }] },
        filters,
      }),
    );
  });

  it("rejects malformed relationship filters at the MCP boundary", () => {
    expect(
      getActivitiesTool.inputSchema.safeParse({
        filters: [{ field: "contactIds", operator: "in", value: [] }],
      }).success,
    ).toBe(false);
    expect(
      getActivitiesTool.inputSchema.safeParse({
        filters: [
          {
            field: "dealIds",
            operator: "hasNone",
            value: ["00000000-0000-4000-8000-000000000001"],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate activity filter fields before invoking the interactor", () => {
    const duplicate = {
      field: "contactIds",
      operator: "hasSome",
    };

    expect(() =>
      getActivitiesTool.inputSchema.parse({
        filters: [duplicate, duplicate],
      }),
    ).toThrow();
    expect(spies.getActivities).not.toHaveBeenCalled();
  });

  it("accepts activity-widget filters unchanged", () => {
    const filter = {
      field: "contactIds",
      operator: "in",
      value: ["00000000-0000-4000-8000-000000000001"],
    };
    const widget = ActivityWidgetDtoSchema.parse({
      id: "00000000-0000-4000-8000-000000000002",
      userId: mockUser.id,
      companyId: mockUser.companyId,
      name: "Recent activity",
      kind: WidgetKind.activityTimeline,
      timelineFilters: [filter],
      displayOptions: { showFilters: true },
      layout: null,
      isTemplate: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });

    expect(
      getActivitiesTool.inputSchema.safeParse({
        filters: widget.timelineFilters,
      }).success,
    ).toBe(true);
  });

  it("rejects the removed partial legacy scope instead of widening it", () => {
    expect(getActivitiesTool.inputSchema.safeParse({ entityType: "deal" }).success).toBe(false);
    expect(
      getActivitiesTool.inputSchema.safeParse({
        entityId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });
});

describe.each([
  ["get_messaging_threads", getMessagingThreadsTool],
  ["get_calendars", getCalendarsTool],
] as const)("%s query bounds", (_name, tool) => {
  it("advertises the same search and filter limits enforced by the query interactor", () => {
    const filter = { field: "state", operator: "equals", value: "open" };

    expect(tool.inputSchema.safeParse({ searchTerm: "a".repeat(200) }).success).toBe(true);
    expect(tool.inputSchema.safeParse({ searchTerm: "a".repeat(201) }).success).toBe(false);
    expect(
      tool.inputSchema.safeParse({
        filters: Array.from({ length: 50 }, () => filter),
      }).success,
    ).toBe(true);
    expect(
      tool.inputSchema.safeParse({
        filters: Array.from({ length: 51 }, () => filter),
      }).success,
    ).toBe(false);
  });
});

describe("email body exposure", () => {
  const message = {
    id: "44444444-4444-4444-8444-444444444444",
    direction: "inbound",
    sender: { displayName: "Syften", identifier: "alerts@syften.com" },
    subject: "Your filters have matched a new result",
    bodyText: "New mention of Customermates (https://www.reddit.com/r/smallbusiness/comments/1abcd/)",
    bodyHtml: '<p>New mention <a href="https://www.reddit.com/r/smallbusiness/comments/1abcd/">link</a></p>',
    isDraft: false,
    attachmentsMeta: [],
    sentAt: new Date("2026-09-01T06:55:15.000Z"),
    editedAt: null,
  };

  it("gives an agent the readable body of an html-only alert", async () => {
    spies.getMessagingThread.mockResolvedValue({
      ok: true,
      data: {
        thread: { id: "t1", participants: [], sharedToCrm: false, isOwner: true },
        messages: [message],
        total: 1,
      },
    });

    const result = await getMessagingThreadsTool.execute(
      getMessagingThreadsTool.inputSchema.parse({ threadId: "55555555-5555-4555-8555-555555555555" }),
    );

    const text = mcpToolResultText(result);
    expect(text).toContain("New mention of Customermates");
    expect(text).toContain("https://www.reddit.com/r/smallbusiness/comments/1abcd/");
  });

  it("does not ship raw email html through the activity timeline", async () => {
    spies.getActivities.mockResolvedValue({
      ok: true,
      data: {
        availableSources: [],
        items: [
          {
            kind: "message",
            id: "a1",
            at: new Date("2026-09-01T06:55:15.000Z"),
            message,
            thread: { id: "t1" },
            senderIsMine: false,
            records: {},
          },
        ],
        pageLimitReached: false,
        scopeTruncated: false,
        pagination: { total: 1 },
      },
    });

    const result = await getActivitiesTool.execute(getActivitiesTool.inputSchema.parse({}));

    const text = mcpToolResultText(result);
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("<a href");
    expect(text).toContain("New mention of Customermates");
  });
});
