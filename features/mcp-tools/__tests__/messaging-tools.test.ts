import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  createAuthLink: vi.fn(),
  getActivities: vi.fn(),
  getMessagingThread: vi.fn(),
  getMessagingThreads: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getCreateAuthLinkInteractor: () => ({ invoke: spies.createAuthLink }),
  getGetRecordActivitiesInteractor: () => ({ invoke: spies.getActivities }),
  getGetMessagingThreadInteractor: () => ({ invoke: spies.getMessagingThread }),
  getGetMessagingThreadsApiInteractor: () => ({ invoke: spies.getMessagingThreads }),
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
  const typeId = "00000000-0000-4000-8000-000000000001";
  const anotherTypeId = "00000000-0000-4000-8000-000000000002";
  const recordId = "00000000-0000-4000-8000-000000000003";
  beforeEach(() => {
    spies.getActivities.mockResolvedValue({
      ok: true,
      data: { items: [], availableSources: ["audit"], nextCursor: null },
    });
  });

  it("passes full references without collapsing equal IDs in different types", async () => {
    const records = [
      { typeId, recordId },
      { typeId: anotherTypeId, recordId },
    ];
    await getActivitiesTool.execute(getActivitiesTool.inputSchema.parse({ scope: { records } }));
    expect(spies.getActivities).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { records, typeIds: [] }, cursor: null, limit: 25 }),
    );
  });

  it("uses the accessible configured paths for an empty scope", async () => {
    await getActivitiesTool.execute(getActivitiesTool.inputSchema.parse({}));
    expect(spies.getActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { records: [], typeIds: [] },
        kinds: ["audit", "message", "activity", "calendar_event"],
      }),
    );
  });

  it("preserves date, provider, thread and cursor constraints", async () => {
    const cursor = { at: "2020-01-01T00:00:00.123456Z", kind: "message", id: recordId };
    const input = {
      scope: { typeIds: [typeId] },
      kinds: ["message"],
      providers: ["mail"],
      threadIds: [recordId],
      after: "2019-01-01T00:00:00Z",
      cursor,
      limit: 5,
    };
    await getActivitiesTool.execute(getActivitiesTool.inputSchema.parse(input));
    expect(spies.getActivities).toHaveBeenCalledWith({ ...input, scope: { typeIds: [typeId], records: [] } });
  });

  it.each([
    { entityType: "deal" },
    { scope: { records: [{ entityType: "deal", ids: [recordId] }] } },
    { filters: [{ field: "contactIds", operator: "in", value: [recordId] }] },
    { scope: { records: [{ recordId }] } },
    { page: 2 },
    { pageSize: 5 },
    { bogusParam: 1 },
  ])("rejects incomplete or retired scope contracts instead of broadening them", (input) => {
    expect(getActivitiesTool.inputSchema.safeParse(input).success).toBe(false);
    expect(spies.getActivities).not.toHaveBeenCalled();
  });

  it("bounds page size and reference count", () => {
    expect(getActivitiesTool.inputSchema.safeParse({ limit: 100 }).success).toBe(true);
    expect(getActivitiesTool.inputSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      getActivitiesTool.inputSchema.safeParse({
        scope: { records: Array.from({ length: 51 }, () => ({ typeId, recordId })) },
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
        nextCursor: null,
      },
    });

    const result = await getActivitiesTool.execute(getActivitiesTool.inputSchema.parse({}));

    const text = mcpToolResultText(result);
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("<a href");
    expect(text).toContain("New mention of Customermates");
  });
});

describe("get_messaging_threads list rows", () => {
  it("say whether the latest sent message went out from the connected account, so answered threads are not read as waiting", async () => {
    const thread = (id: string, lastSentMessageFromSelf: boolean) => ({
      id,
      connectedAccountId: "66666666-6666-4666-8666-666666666666",
      provider: "gmail",
      type: "single",
      name: null,
      subject: `Thread ${id}`,
      preview: "preview",
      state: "read",
      lastMessageAt: new Date("2026-09-01T06:55:15.000Z"),
      lastMessageFromSelf: true,
      lastSentMessageFromSelf,
      participants: [],
      sharedToCrm: false,
      isOwner: true,
    });
    spies.getMessagingThreads.mockResolvedValue({
      ok: true,
      data: { items: [thread("answered", true), thread("waiting", false)], pagination: { total: 2 } },
    });

    const result = await getMessagingThreadsTool.execute(getMessagingThreadsTool.inputSchema.parse({}));

    expect(result).toMatchObject({
      structuredContent: {
        items: [
          { id: "answered", lastSentMessageFromSelf: true },
          { id: "waiting", lastSentMessageFromSelf: false },
        ],
      },
    });
    const [first] = (result as { structuredContent: Record<string, unknown[]> }).structuredContent.items;
    expect(first).not.toHaveProperty("lastMessageFromSelf");
    expect(getMessagingThreadsTool.description).toContain("lastSentMessageFromSelf");
    expect(getMessagingThreadsTool.description).toContain("null when nothing has been sent yet");
  });
});

describe("page sizes that are not offered", () => {
  it("pass a thread detail's page size straight through, since the thread reader takes any size", async () => {
    spies.getMessagingThread.mockResolvedValue({
      ok: true,
      data: { thread: { id: "t1", participants: [], sharedToCrm: false, isOwner: true }, messages: [], total: 0 },
    });
    const threadId = "55555555-5555-4555-8555-555555555555";

    const result = await getMessagingThreadsTool.execute(
      getMessagingThreadsTool.inputSchema.parse({ threadId, page: 3, pageSize: 7 }),
    );

    expect(spies.getMessagingThread).toHaveBeenCalledTimes(1);
    expect(spies.getMessagingThread).toHaveBeenCalledWith({ threadId, page: 3, pageSize: 7 });
    expect(result).toMatchObject({ structuredContent: { page: 3, pageSize: 7 } });
  });
});
