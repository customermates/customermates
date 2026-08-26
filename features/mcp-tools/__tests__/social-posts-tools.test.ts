import { describe, it, expect, vi, beforeEach } from "vitest";

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
  it("omits pagination inputs on the initial call and returns next_cursor", async () => {
    spies.listSocialPosts.mockResolvedValue({
      ok: true as const,
      data: { data: [{ id: "post-1", text: "Hello" }], total_count: 1, next_cursor: "cursor-2" },
    });

    const result = await runPosts({ connectedAccountId: ACCOUNT_ID, authorIdentifier: "ACoAAProviderId" });

    expect(spies.listSocialPosts).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "ACoAAProviderId",
      cursor: undefined,
      offset: undefined,
      limit: 10,
    });
    expect(result).toContain("post-1");
    expect(result).toContain("cursor-2");
  });

  it("forwards only the continuation cursor selected by the caller", async () => {
    await runPosts({ connectedAccountId: ACCOUNT_ID, cursor: "cursor-2", limit: 5 });

    expect(spies.listSocialPosts).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "me",
      cursor: "cursor-2",
      offset: undefined,
      limit: 5,
    });
  });

  it("documents that the initial request has no pagination selector", () => {
    expect(getSocialPostsTool.inputSchema.shape.offset.description).toContain("Omit cursor and offset");
    expect(getSocialPostsTool.inputSchema.shape.cursor.description).toContain("Omit cursor and offset");
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
    expect(result).toContain("Ada Lovelace");
    expect(result).toContain("Engineer");
    expect(result).toContain("London");
    expect(result).not.toContain("member_id");
    expect(result).not.toContain("123456");
  });

  it("carries the type discriminator for company profiles", async () => {
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
    expect(result).toContain("organization");
    expect(result).toContain("Acme GmbH");
  });

  it("defaults to a person profile and documents the reusable identifiers", async () => {
    spies.getSocialProfile.mockResolvedValue({ ok: true as const, data: { id: "ACoAAProviderId" } });

    await runProfile({ connectedAccountId: ACCOUNT_ID, identifier: "ada" });

    expect(spies.getSocialProfile).toHaveBeenCalledWith({
      connectedAccountId: ACCOUNT_ID,
      identifier: "ada",
      profileType: "person",
    });
    expect(getSocialProfileTool.inputSchema.shape.identifier.description).toContain("never member_id");
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
    expect(result).toContain("current_positions");
    expect(result).toContain("Navy Labs");
    expect(result).toContain("navy-1");
    expect(result).not.toContain("Past Inc");
  });
});

describe("manage_social_relations routing", () => {
  it("lists received requests for action=list", async () => {
    await runRelations({ action: "list", connectedAccountId: ACCOUNT_ID });
    expect(spies.listRelationRequests).toHaveBeenCalledOnce();
  });

  it("creates a request for action=invite", async () => {
    spies.createRelationRequest.mockResolvedValue({ ok: true as const, data: { object: "RelationRequest", id: "r1" } });
    await runRelations({ action: "invite", connectedAccountId: ACCOUNT_ID, identifier: "u1" });
    expect(spies.createRelationRequest).toHaveBeenCalledOnce();
  });

  it("rejects invite without identifier as a clean validation error", async () => {
    const result = await runRelations({ action: "invite", connectedAccountId: ACCOUNT_ID });
    expect(result).toContain("Validation error:");
    expect(spies.createRelationRequest).not.toHaveBeenCalled();
  });

  it("accepts a request for action=accept", async () => {
    spies.acceptRelationRequest.mockResolvedValue({ ok: true as const, data: { object: "RelationRequestConfirmed" } });
    await runRelations({ action: "accept", connectedAccountId: ACCOUNT_ID, invitationId: "r1" });
    expect(spies.acceptRelationRequest).toHaveBeenCalledOnce();
    expect(spies.cancelRelationRequest).not.toHaveBeenCalled();
  });

  it("cancels a request for action=cancel", async () => {
    spies.cancelRelationRequest.mockResolvedValue({ ok: true as const, data: { object: "RelationRequestCanceled" } });
    await runRelations({ action: "cancel", connectedAccountId: ACCOUNT_ID, invitationId: "r1" });
    expect(spies.cancelRelationRequest).toHaveBeenCalledOnce();
    expect(spies.acceptRelationRequest).not.toHaveBeenCalled();
  });

  it("rejects accept without invitationId as a clean validation error", async () => {
    const result = await runRelations({ action: "accept", connectedAccountId: ACCOUNT_ID });
    expect(result).toContain("Validation error:");
    expect(spies.acceptRelationRequest).not.toHaveBeenCalled();
  });
});
