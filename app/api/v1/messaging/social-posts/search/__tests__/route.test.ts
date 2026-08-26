import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

const interactors = vi.hoisted(() => ({
  getPost: vi.fn(),
  listPosts: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getGetSocialPostInteractor: () => ({ invoke: interactors.getPost }),
  getListSocialPostsInteractor: () => ({ invoke: interactors.listPosts }),
}));

import { POST } from "../route";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

function request(payload: unknown): NextRequest {
  return new Request("http://localhost/api/v1/messaging/social-posts/search", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  }) as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  interactors.getPost.mockResolvedValue({ ok: true, data: { id: "post-1" } });
  interactors.listPosts.mockResolvedValue({ ok: true, data: { data: [], next_cursor: null } });
});

describe("social-post search route", () => {
  it("preserves postId and dispatches a single-post request", async () => {
    const response = await POST(request({ connectedAccountId: ACCOUNT_ID, postId: "post-1" }));

    expect(response.status).toBe(200);
    expect(interactors.getPost).toHaveBeenCalledExactlyOnceWith({
      connectedAccountId: ACCOUNT_ID,
      postId: "post-1",
    });
    expect(interactors.listPosts).not.toHaveBeenCalled();
  });

  it("preserves legacy continuation defaults before dispatch", async () => {
    const response = await POST(request({ connectedAccountId: ACCOUNT_ID, cursor: "cursor-2" }));

    expect(response.status).toBe(200);
    expect(interactors.listPosts).toHaveBeenCalledExactlyOnceWith({
      connectedAccountId: ACCOUNT_ID,
      authorIdentifier: "me",
      cursor: "cursor-2",
      limit: 10,
    });
    expect(interactors.getPost).not.toHaveBeenCalled();
  });

  it("strips legacy list parameters from a single-post request", async () => {
    const response = await POST(request({ connectedAccountId: ACCOUNT_ID, postId: "post-1", authorIdentifier: "me" }));

    expect(response.status).toBe(200);
    expect(interactors.getPost).toHaveBeenCalledExactlyOnceWith({
      connectedAccountId: ACCOUNT_ID,
      postId: "post-1",
    });
    expect(interactors.listPosts).not.toHaveBeenCalled();
  });
});
