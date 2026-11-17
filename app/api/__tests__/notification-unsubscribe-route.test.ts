import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/core/di", () => ({ getSetNotificationKindOffInteractor: () => ({ invoke }) }));
vi.mock("@/env", () => ({ env: { BASE_URL: "https://app.example.test" } }));

import { GET } from "../notifications/unsubscribe/route";

function request(query: string) {
  return new Request(`https://app.example.test/api/notifications/unsubscribe${query}`);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/notifications/unsubscribe", () => {
  it("turns the kind off and redirects to the profile settings with a notice for the toast", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { status: "off", kind: "ruleAlert", workspaceSlug: "ws-1", locale: "de" },
    });

    const response = await GET(request("?token=abc"));

    expect(invoke).toHaveBeenCalledWith({ token: "abc" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/w/ws-1/settings/profile?notice=notification-kind-off&kind=ruleAlert",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 400 for a wrong token", async () => {
    invoke.mockResolvedValue({ ok: true, data: { status: "invalid" } });

    const response = await GET(request("?token=wrong"));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers 400 when the token is missing or the interactor refuses it", async () => {
    invoke.mockResolvedValue({ ok: false, error: new Error("invalid") });

    const response = await GET(request(""));

    expect(invoke).toHaveBeenCalledWith({ token: "" });
    expect(response.status).toBe(400);
  });

  it("answers 410 for an expired link", async () => {
    invoke.mockResolvedValue({ ok: true, data: { status: "expired" } });

    const response = await GET(request("?token=old"));

    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
  });

  it("is safe to follow twice", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { status: "off", kind: "dueToday", workspaceSlug: "ws-1", locale: "en" },
    });

    const first = await GET(request("?token=abc"));
    const second = await GET(request("?token=abc"));

    expect(second.status).toBe(first.status);
    expect(second.headers.get("location")).toBe(first.headers.get("location"));
  });
});
