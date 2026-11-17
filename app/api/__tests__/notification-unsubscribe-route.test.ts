import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/core/di", () => ({ getSetNotificationKindOffInteractor: () => ({ invoke }) }));
vi.mock("@/env", () => ({ env: { BASE_URL: "https://app.example.test" } }));

import { GET, POST } from "../notifications/unsubscribe/route";

const URL_BASE = "https://app.example.test/api/notifications/unsubscribe";

function link(query: string) {
  return new Request(`${URL_BASE}${query}`);
}

function confirmation(fields: Record<string, string>) {
  return new Request(URL_BASE, { method: "POST", body: new URLSearchParams(fields) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/notifications/unsubscribe", () => {
  it("changes nothing when a mail scanner follows the link and leads to the confirmation page in the member's language", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { status: "pending", kind: "ruleAlert", workspaceSlug: "ws-1", locale: "de" },
    });

    const response = await GET(link("?token=a.b%2Bc"));

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({ token: "a.b+c", confirmed: false });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/notification-emails/turn-off?token=a.b%2Bc",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("answers 400 for a wrong token", async () => {
    invoke.mockResolvedValue({ ok: true, data: { status: "invalid" } });

    const response = await GET(link("?token=wrong"));

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers 400 with the shared failure body when the token is missing", async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["token"], message: "Required" }]),
    });

    const response = await GET(link(""));

    expect(invoke).toHaveBeenCalledWith({ token: "", confirmed: false });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).error.kind).toBe("validation");
  });

  it("answers 410 for an expired link", async () => {
    invoke.mockResolvedValue({ ok: true, data: { status: "expired" } });

    const response = await GET(link("?token=old"));

    expect(response.status).toBe(410);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("POST /api/notifications/unsubscribe", () => {
  it("turns the kind off and redirects to the profile settings with a notice for the toast", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { status: "off", kind: "ruleAlert", workspaceSlug: "ws-1", locale: "de" },
    });

    const response = await POST(confirmation({ token: "abc" }));

    expect(invoke).toHaveBeenCalledWith({ token: "abc", confirmed: true });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/w/ws-1/settings/profile?notice=notification-kind-off&kind=ruleAlert",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses a confirmation without a token, with a wrong one and with an expired one", async () => {
    invoke.mockResolvedValueOnce({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["token"], message: "Required" }]),
    });
    invoke.mockResolvedValueOnce({ ok: true, data: { status: "invalid" } });
    invoke.mockResolvedValueOnce({ ok: true, data: { status: "expired" } });

    expect((await POST(confirmation({}))).status).toBe(400);
    expect(invoke).toHaveBeenLastCalledWith({ token: "", confirmed: true });
    expect((await POST(confirmation({ token: "wrong" }))).status).toBe(400);
    expect((await POST(confirmation({ token: "old" }))).status).toBe(410);
  });

  it("is safe to confirm twice", async () => {
    invoke.mockResolvedValue({
      ok: true,
      data: { status: "off", kind: "dueToday", workspaceSlug: "ws-1", locale: "en" },
    });

    const first = await POST(confirmation({ token: "abc" }));
    const second = await POST(confirmation({ token: "abc" }));

    expect(second.status).toBe(first.status);
    expect(second.headers.get("location")).toBe(first.headers.get("location"));
  });
});
