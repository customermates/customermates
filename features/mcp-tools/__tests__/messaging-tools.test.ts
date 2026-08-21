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
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getCreateAuthLinkInteractor: () => ({ invoke: spies.createAuthLink }),
  getGetActivitiesApiInteractor: () => ({ invoke: spies.getActivities }),
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
    expect(result).toContain("https://auth.example.com/link-abc");
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
