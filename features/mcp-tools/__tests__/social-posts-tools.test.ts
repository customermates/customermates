import { describe, it, expect, vi, beforeEach } from "vitest";
import { mcpToolResultText } from "../mcp-tool";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
  listSocialPosts: vi.fn(),
  getSocialPost: vi.fn(),
  listPostComments: vi.fn(),
  listCommentReactions: vi.fn(),
  listPostReactions: vi.fn(),
  getSocialProfile: vi.fn(),
  listRelationRequests: vi.fn(),
  createRelationRequest: vi.fn(),
  acceptRelationRequest: vi.fn(),
  cancelRelationRequest: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getListSocialPostsInteractor: () => ({ invoke: spies.listSocialPosts }),
  getGetSocialPostInteractor: () => ({ invoke: spies.getSocialPost }),
  getListSocialPostCommentsInteractor: () => ({ invoke: spies.listPostComments }),
  getListSocialCommentReactionsInteractor: () => ({ invoke: spies.listCommentReactions }),
  getListSocialPostReactionsInteractor: () => ({ invoke: spies.listPostReactions }),
  getGetSocialProfileInteractor: () => ({ invoke: spies.getSocialProfile }),
  getListRelationRequestsInteractor: () => ({ invoke: spies.listRelationRequests }),
  getCreateRelationRequestInteractor: () => ({ invoke: spies.createRelationRequest }),
  getAcceptRelationRequestInteractor: () => ({ invoke: spies.acceptRelationRequest }),
  getCancelRelationRequestInteractor: () => ({ invoke: spies.cancelRelationRequest }),
}));

import {
  getSocialPostsTool,
  getSocialPostEngagementTool,
  getSocialProfileTool,
  manageSocialRelationsTool,
} from "../social-posts.mcp-tools";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const emptyList = { ok: true as const, data: { data: [], total_count: 0, next_cursor: null } };

function runPosts(args: Record<string, unknown>) {
  return getSocialPostsTool.execute(getSocialPostsTool.inputSchema.parse(args));
}

function runEngagement(args: Record<string, unknown>) {
  return getSocialPostEngagementTool.execute(getSocialPostEngagementTool.inputSchema.parse(args));
}

function runRelations(args: Record<string, unknown>) {
  return manageSocialRelationsTool.execute(manageSocialRelationsTool.inputSchema.parse(args));
}

function runProfile(args: Record<string, unknown>) {
  return getSocialProfileTool.execute(getSocialProfileTool.inputSchema.parse(args));
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const spy of Object.values(spies)) spy.mockResolvedValue(emptyList);
});

describe("get_social_posts routing", () => {
  it("publishes its real input fields through MCP tools/list", async () => {
    const server = new McpServer({ name: "social-posts-schema-test", version: "1.0.0" });
    server.registerTool(
      getSocialPostsTool.name,
      {
        title: getSocialPostsTool.title,
        description: getSocialPostsTool.description,
        inputSchema: getSocialPostsTool.inputSchema,
        annotations: getSocialPostsTool.annotations,
      },
      () => ({ content: [] }),
    );
    const client = new Client({ name: "social-posts-schema-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const tool = (await client.listTools()).tools.find(({ name }) => name === getSocialPostsTool.name);
      expect(tool?.inputSchema.properties).toEqual(
        expect.objectContaining({
          connectedAccountId: expect.any(Object),
          postId: expect.any(Object),
          authorIdentifier: expect.any(Object),
          cursor: expect.any(Object),
          offset: expect.any(Object),
          limit: expect.any(Object),
        }),
      );
      expect(tool?.inputSchema.additionalProperties).toBe(false);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("routes a canonical postId request to the single-post interactor", async () => {
    spies.getSocialPost.mockResolvedValue({ ok: true as const, data: { id: "post-1" } });

    await runPosts({ connectedAccountId: ACCOUNT_ID, postId: "post-1" });

    expect(spies.getSocialPost).toHaveBeenCalledWith({ connectedAccountId: ACCOUNT_ID, postId: "post-1" });
    expect(spies.listSocialPosts).not.toHaveBeenCalled();
  });

  it("returns the canonical post validation error for mixed single-post and list fields", async () => {
    const result = await runPosts({
      connectedAccountId: ACCOUNT_ID,
      postId: "post-1",
      authorIdentifier: "me",
    });

    expect(mcpToolResultText(result)).toContain("Validation error:");
    expect(spies.getSocialPost).not.toHaveBeenCalled();
    expect(spies.listSocialPosts).not.toHaveBeenCalled();
  });

  it("omits pagination inputs on the initial call and returns next_cursor", async () => {
    spies.listSocialPosts.mockResolvedValue({
      ok: true as const,
      data: { data: [{ id: "post-1", text: "Hello" }], total_count: 1, next_cursor: "cursor-2" },
    });

    const result = await runPosts({ connectedAccountId: ACCOUNT_ID, authorIdentifier: "ACoAAProviderId" });

    expect(spies.listSocialPosts).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      limit: 10,
    });
    expect(mcpToolResultText(result)).toContain("post-1");
    expect(mcpToolResultText(result)).toContain("cursor-2");
  });

  it("continues with the same explicit author and limit", async () => {
    await runPosts({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      cursor: "cursor-2",
      limit: 5,
    });

    expect(spies.listSocialPosts).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      cursor: "cursor-2",
      limit: 5,
    });
  });

  it("returns canonical validation errors for incomplete or conflicting continuation inputs", async () => {
    const missingAuthor = await runPosts({
      connectedAccountId: ACCOUNT_ID,
      cursor: "cursor-2",
      limit: 5,
    });
    const conflictingPagination = await runPosts({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      cursor: "cursor-2",
      offset: 5,
      limit: 5,
    });
    const zeroOffset = await getSocialPostsTool.execute({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      offset: 0,
      limit: 5,
    });

    expect(mcpToolResultText(missingAuthor)).toContain("Validation error:");
    expect(mcpToolResultText(conflictingPagination)).toContain("Validation error:");
    expect(mcpToolResultText(zeroOffset)).toContain("Validation error:");
    expect(
      getSocialPostsTool.inputSchema.safeParse({
        connectedAccountId: ACCOUNT_ID,
        authorIdentifier: "ACoAAProviderId",
        offset: 0,
        limit: 5,
      }).success,
    ).toBe(false);
    expect(spies.listSocialPosts).not.toHaveBeenCalled();
  });

  it("defaults to the account owner only on an initial request", async () => {
    await runPosts({ connectedAccountId: ACCOUNT_ID });

    expect(spies.listSocialPosts).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "me",
      limit: 10,
    });
    expect(getSocialPostsTool.description).toContain("repeat the same connectedAccountId, authorIdentifier and limit");
    expect(getSocialPostsTool.description).toContain("get_social_posts.items[].author.id");
    expect(getSocialPostsTool.description).toContain("get_social_posts.author.id");
    expect(getSocialPostsTool.description).toContain("get_social_post_engagement.items[].author.id");
    expect(getSocialPostsTool.description).toContain("get_social_post_engagement.items[].sender.id");
    expect(getSocialPostsTool.description).toContain("manage_social_relations.items[].user.id");
    expect(getSocialPostsTool.description).not.toContain("member_id");
  });
});

describe("get_social_post_engagement routing", () => {
  it("lists comments by default", async () => {
    await runEngagement({ connectedAccountId: ACCOUNT_ID, postId: "p1", kind: "comments" });
    expect(spies.listPostComments).toHaveBeenCalledOnce();
    expect(spies.listPostReactions).not.toHaveBeenCalled();
    expect(spies.listCommentReactions).not.toHaveBeenCalled();
  });

  it("lists post reactions when kind=reactions", async () => {
    await runEngagement({ connectedAccountId: ACCOUNT_ID, postId: "p1", kind: "reactions" });
    expect(spies.listPostReactions).toHaveBeenCalledOnce();
    expect(spies.listPostComments).not.toHaveBeenCalled();
  });

  it("lists comment reactions when commentId is set, ignoring kind", async () => {
    await runEngagement({
      connectedAccountId: ACCOUNT_ID,
      postId: "p1",
      commentId: "c1",
      kind: "reactions",
    });
    expect(spies.listCommentReactions).toHaveBeenCalledOnce();
    expect(spies.listPostReactions).not.toHaveBeenCalled();
    expect(spies.listPostComments).not.toHaveBeenCalled();
  });
});

describe("get_social_profile", () => {
  it("returns profile fields on the happy path", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true as const,
      data: {
        id: "u1",
        display_name: "Ada Lovelace",
        public_identifier: "ada",
        profile_url: "https://linkedin.com/in/ada",
        specifics: { member_id: "123456", headline: "Engineer", location: "London", followers_count: 42 },
      },
    });
    const result = await runProfile({ connectedAccountId: ACCOUNT_ID, identifier: "ada" });
    expect(spies.getSocialProfile).toHaveBeenCalledOnce();
    expect(mcpToolResultText(result)).toContain("Ada Lovelace");
    expect(mcpToolResultText(result)).toContain("Engineer");
    expect(mcpToolResultText(result)).toContain("London");
    expect(mcpToolResultText(result)).not.toContain("member_id");
    expect(mcpToolResultText(result)).not.toContain("123456");
  });

  it("returns the explicit lookup route separately from the provider-reported type", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true as const,
      data: { id: "c1", type: "organization", display_name: "Acme GmbH", public_identifier: "acme" },
    });
    const result = await runProfile({
      connectedAccountId: ACCOUNT_ID,
      identifier: "company-123",
      profileType: "company",
    });
    expect(spies.getSocialProfile).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      identifier: "company-123",
      profileType: "company",
    });
    expect(mcpToolResultText(result)).toContain("profile_type: company");
    expect(mcpToolResultText(result)).toContain("organization");
    expect(mcpToolResultText(result)).toContain("Acme GmbH");
  });

  it("defaults to a person route even when the provider reports organization", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true as const,
      data: { id: "ACoAAProviderId", type: "organization" },
    });

    const result = await runProfile({ connectedAccountId: ACCOUNT_ID, identifier: "ada" });

    expect(spies.getSocialProfile).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      identifier: "ada",
      profileType: "person",
    });
    expect(mcpToolResultText(result)).toContain("profile_type: person");
    expect(mcpToolResultText(result)).toContain("type: organization");
    expect(getSocialProfileTool.inputSchema.shape.identifier.description).toContain(
      "get_messaging_threads.items[].participants[].identifier",
    );
    expect(getSocialProfileTool.inputSchema.shape.identifier.description).toContain(
      "get_messaging_threads.thread.participants[].identifier",
    );
    expect(getSocialProfileTool.inputSchema.shape.identifier.description).toContain(
      "get_social_posts.items[].author.id",
    );
    expect(getSocialProfileTool.inputSchema.shape.identifier.description).toContain("get_social_posts.author.id");
    expect(getSocialProfileTool.inputSchema.shape.identifier.description).not.toContain("member_id");
    expect(getSocialProfileTool.description).not.toContain("member_id");
  });

  it("maps ongoing experience entries into current_positions", async () => {
    spies.getSocialProfile.mockResolvedValue({
      ok: true as const,
      data: {
        id: "u2",
        display_name: "Grace Hopper",
        specifics: {
          experience: [
            { company: { name: "Navy Labs", id: "navy-1" }, job_title: "Admiral" },
            { company: { name: "Past Inc", id: "past-1" }, job_title: "Analyst", ended_on: "01/01/1980" },
          ],
        },
      },
    });
    const result = await runProfile({ connectedAccountId: ACCOUNT_ID, identifier: "grace" });
    expect(mcpToolResultText(result)).toContain("current_positions");
    expect(mcpToolResultText(result)).toContain("Navy Labs");
    expect(mcpToolResultText(result)).toContain("navy-1");
    expect(mcpToolResultText(result)).not.toContain("Past Inc");
  });
});

describe("manage_social_relations routing", () => {
  it("documents profile resolution instead of a nonexistent participant id", () => {
    expect(manageSocialRelationsTool.description).toContain("get_messaging_threads.items[].participants[].identifier");
    expect(manageSocialRelationsTool.description).toContain("get_messaging_threads.thread.participants[].identifier");
    expect(manageSocialRelationsTool.description).toContain("manage_social_relations.items[].user.id");
  });

  it("lists received requests for action=list", async () => {
    await runRelations({ action: "list", connectedAccountId: ACCOUNT_ID });
    expect(spies.listRelationRequests).toHaveBeenCalledOnce();
  });

  it("creates a request for action=invite", async () => {
    spies.createRelationRequest.mockResolvedValue({ ok: true as const, data: { object: "RelationRequest", id: "r1" } });
    await runRelations({
      action: "invite",
      connectedAccountId: ACCOUNT_ID,
      identifier: "u1",
    });
    expect(spies.createRelationRequest).toHaveBeenCalledOnce();
  });

  it("rejects invite without identifier before execution", () => {
    expect(() =>
      manageSocialRelationsTool.inputSchema.parse({
        action: "invite",
        connectedAccountId: ACCOUNT_ID,
      }),
    ).toThrow(/identifier/);
    expect(spies.createRelationRequest).not.toHaveBeenCalled();
  });

  it("keeps the established public MCP mutation input backwards compatible", () => {
    expect(
      manageSocialRelationsTool.inputSchema.parse({
        action: "invite",
        connectedAccountId: ACCOUNT_ID,
        identifier: "u1",
      }),
    ).toMatchObject({ action: "invite", identifier: "u1" });
  });

  it("accepts a request for action=accept", async () => {
    spies.acceptRelationRequest.mockResolvedValue({ ok: true as const, data: { object: "RelationRequestConfirmed" } });
    await runRelations({
      action: "accept",
      connectedAccountId: ACCOUNT_ID,
      invitationId: "r1",
    });
    expect(spies.acceptRelationRequest).toHaveBeenCalledOnce();
    expect(spies.cancelRelationRequest).not.toHaveBeenCalled();
  });

  it("cancels a request for action=cancel", async () => {
    spies.cancelRelationRequest.mockResolvedValue({ ok: true as const, data: { object: "RelationRequestCanceled" } });
    await runRelations({
      action: "cancel",
      connectedAccountId: ACCOUNT_ID,
      invitationId: "r1",
    });
    expect(spies.cancelRelationRequest).toHaveBeenCalledOnce();
    expect(spies.acceptRelationRequest).not.toHaveBeenCalled();
  });

  it("rejects accept without invitationId before execution", () => {
    expect(() =>
      manageSocialRelationsTool.inputSchema.parse({
        action: "accept",
        connectedAccountId: ACCOUNT_ID,
      }),
    ).toThrow(/invitationId/);
    expect(spies.acceptRelationRequest).not.toHaveBeenCalled();
  });
});
