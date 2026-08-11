import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { withAbsoluteAssetUrls } from "../absolute-asset-url";

const BASE = MOCK_ENV_MODULE.env.BASE_URL;

describe("withAbsoluteAssetUrls", () => {
  it("absolutises a same-origin avatar path", () => {
    expect(withAbsoluteAssetUrls({ avatarUrl: "/demo/avatars/photos/max-bergmann.png" })).toEqual({
      avatarUrl: `${BASE}/demo/avatars/photos/max-bergmann.png`,
    });
  });

  it.each([["https://cdn.unipile.com/p/abc.jpg"], ["http://cdn.example.com/a.png"], ["//cdn.example.com/a.png"]])(
    "leaves the already-absolute avatar %j byte-identical",
    (avatarUrl) => {
      expect(withAbsoluteAssetUrls({ avatarUrl })).toEqual({ avatarUrl });
    },
  );

  it("leaves a null avatar alone", () => {
    expect(withAbsoluteAssetUrls({ avatarUrl: null })).toEqual({ avatarUrl: null });
  });

  it("reaches an avatar nested inside a user reference, which is how it rides out on entity payloads", () => {
    const payload = {
      entityId: "1",
      contact: {
        avatarUrl: "/demo/avatars/photos/lea-bauer.png",
        assignees: [{ id: "u1", avatarUrl: "/demo/avatars/photos/max-bergmann.png" }],
      },
    };

    expect(withAbsoluteAssetUrls(payload)).toEqual({
      entityId: "1",
      contact: {
        avatarUrl: `${BASE}/demo/avatars/photos/lea-bauer.png`,
        assignees: [{ id: "u1", avatarUrl: `${BASE}/demo/avatars/photos/max-bergmann.png` }],
      },
    });
  });

  it("touches no other field, including other paths that look like assets", () => {
    const payload = { avatarUrl: "/a.png", logoUrl: "/b.png", url: "/c", name: "/not-a-url" };

    expect(withAbsoluteAssetUrls(payload)).toEqual({
      avatarUrl: `${BASE}/a.png`,
      logoUrl: "/b.png",
      url: "/c",
      name: "/not-a-url",
    });
  });

  it("preserves Date instances rather than shredding them into plain objects", () => {
    const createdAt = new Date("2026-08-11T10:00:00.000Z");
    const result = withAbsoluteAssetUrls({ createdAt, avatarUrl: "/a.png" });

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe("2026-08-11T10:00:00.000Z");
  });
});
