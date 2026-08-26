import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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

function request(payload: unknown): { request: NextRequest; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn().mockResolvedValue(payload);
  return { request: { json } as unknown as NextRequest, json };
}

beforeEach(() => {
  vi.clearAllMocks();
  interactors.getPost.mockResolvedValue({ ok: true, data: { id: "post-1" } });
  interactors.listPosts.mockResolvedValue({ ok: true, data: { data: [], next_cursor: null } });
});

describe("social-post search route", () => {
  it("dispatches a body with postId unchanged to the single-post actor", async () => {
    const body = { connectedAccountId: ACCOUNT_ID, postId: "post-1" };
    const { request: nextRequest, json } = request(body);
    const response = await POST(nextRequest);

    expect(response.status).toBe(200);
    expect(json).toHaveBeenCalledOnce();
    expect(interactors.getPost).toHaveBeenCalledExactlyOnceWith(body);
    expect(interactors.listPosts).not.toHaveBeenCalled();
  });

  it("dispatches a body without postId unchanged to the list actor", async () => {
    const body = { connectedAccountId: ACCOUNT_ID, authorIdentifier: "me", limit: 10 };
    const { request: nextRequest, json } = request(body);
    const response = await POST(nextRequest);

    expect(response.status).toBe(200);
    expect(json).toHaveBeenCalledOnce();
    expect(interactors.listPosts).toHaveBeenCalledExactlyOnceWith(body);
    expect(interactors.getPost).not.toHaveBeenCalled();
  });

  it("dispatches an empty postId to the single-post actor and returns its validation failure", async () => {
    interactors.getPost.mockResolvedValueOnce({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["postId"], message: "Post ID is required" }]),
    });
    const body = { connectedAccountId: ACCOUNT_ID, postId: "" };
    const { request: nextRequest } = request(body);
    const response = await POST(nextRequest);

    expect(response.status).toBe(400);
    expect(await response.json()).toContain("Post ID is required");
    expect(interactors.getPost).toHaveBeenCalledExactlyOnceWith(body);
    expect(interactors.listPosts).not.toHaveBeenCalled();
  });

  it("returns an actor validation failure as a bad request", async () => {
    interactors.listPosts.mockResolvedValueOnce({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["cursor"], message: "Invalid continuation" }]),
    });
    const { request: nextRequest } = request({ connectedAccountId: ACCOUNT_ID, cursor: "cursor-2" });

    const response = await POST(nextRequest);

    expect(response.status).toBe(400);
    expect(await response.json()).toContain("Invalid continuation");
  });
});
