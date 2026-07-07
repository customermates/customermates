import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

const spies = vi.hoisted(() => ({
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
  getListSocialPostsInteractor: () => ({ invoke: vi.fn() }),
  getGetSocialPostInteractor: () => ({ invoke: vi.fn() }),
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
  getSocialPostEngagementTool,
  getSocialProfileTool,
  manageSocialRelationsTool,
} from "../social-posts.mcp-tools";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const emptyList = { ok: true as const, data: { data: [], total_count: 0, next_cursor: null } };

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
        specifics: { headline: "Engineer", location: "London", followers_count: 42 },
      },
    });
    const result = await runProfile({ connectedAccountId: ACCOUNT_ID, identifier: "ada" });
    expect(spies.getSocialProfile).toHaveBeenCalledOnce();
    expect(result).toContain("Ada Lovelace");
    expect(result).toContain("Engineer");
    expect(result).toContain("London");
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
