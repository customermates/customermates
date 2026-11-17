import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/core/di", () => ({ getSetNotificationKindOffInteractor: () => ({ invoke }) }));
vi.mock("@/env", () => ({ env: { BASE_URL: "https://app.example.test" } }));

import { GET, POST } from "../notifications/unsubscribe/route";

const URL_BASE = "https://app.example.test/api/notifications/unsubscribe";

function link(query: string, headers: Record<string, string> = {}) {
  return new Request(`${URL_BASE}${query}`, { headers });
}

function confirmation(fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(URL_BASE, { method: "POST", body: new URLSearchParams(fields), headers });
}

function outcome(status: "off" | "pending", overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    data: {
      status,
      kind: "ruleAlert",
      workspaceSlug: "ws-1",
      workspaceName: "Acme",
      maskedEmail: "s•••@example.test",
      viewerIsMember: false,
      locale: "de",
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/notifications/unsubscribe", () => {
  it("changes nothing when a mail scanner follows the link and leads to the confirmation page in the member's language", async () => {
    invoke.mockResolvedValue(outcome("pending"));

    const response = await GET(link("?token=a.b%2Bc"));

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith({ token: "a.b+c", confirmed: false });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/notification-emails/turn-off?token=a.b%2Bc",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("never leads to the member's settings, even when that member is signed in and the kind is already off", async () => {
    invoke.mockResolvedValue(outcome("off", { viewerIsMember: true }));

    const response = await GET(link("?token=abc"));

    expect(response.headers.get("location")).toBe("https://app.example.test/de/notification-emails/turn-off?token=abc");
  });

  it("sends a wrong or expired link to the localised page in the reader's language instead of plain text", async () => {
    invoke.mockResolvedValueOnce({ ok: true, data: { status: "invalid" } });
    invoke.mockResolvedValueOnce({ ok: true, data: { status: "expired" } });

    const wrong = await GET(link("?token=wrong", { "accept-language": "en;q=0.5, fr-CH, de;q=0.8" }));
    const expired = await GET(link("?token=old"));

    expect(wrong.status).toBe(303);
    expect(wrong.headers.get("location")).toBe("https://app.example.test/fr/notification-emails/turn-off?token=wrong");
    expect(wrong.headers.get("content-type")).toBeNull();
    expect(expired.status).toBe(303);
    expect(expired.headers.get("location")).toBe("https://app.example.test/en/notification-emails/turn-off?token=old");
    expect(expired.headers.get("cache-control")).toBe("private, no-store");
  });

  it("sends a link without a token, or with one too long to be real, to the same page without echoing it", async () => {
    invoke.mockResolvedValue({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["token"], message: "Required" }]),
    });

    const missing = await GET(link(""));
    const oversized = await GET(link(`?token=${"x".repeat(300)}`));

    expect(invoke).toHaveBeenCalledWith({ token: "", confirmed: false });
    expect(missing.status).toBe(303);
    expect(missing.headers.get("location")).toBe("https://app.example.test/en/notification-emails/turn-off");
    expect(oversized.headers.get("location")).toBe("https://app.example.test/en/notification-emails/turn-off");
  });
});

describe("POST /api/notifications/unsubscribe", () => {
  it("turns the kind off and shows the signed-in member their settings with a notice for the toast", async () => {
    invoke.mockResolvedValue(outcome("off", { viewerIsMember: true }));

    const response = await POST(confirmation({ token: "abc" }));

    expect(invoke).toHaveBeenCalledWith({ token: "abc", confirmed: true });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/w/ws-1/settings/profile?notice=notification-kind-off&kind=ruleAlert",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("shows everyone else, signed in or not, the result page that names whose emails were switched off", async () => {
    invoke.mockResolvedValue(outcome("off"));

    const response = await POST(confirmation({ token: "abc" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/de/notification-emails/turn-off?token=abc");
  });

  it("sends a confirmation without a token, with a wrong one and with an expired one to the localised page", async () => {
    invoke.mockResolvedValueOnce({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["token"], message: "Required" }]),
    });
    invoke.mockResolvedValueOnce({ ok: true, data: { status: "invalid" } });
    invoke.mockResolvedValueOnce({ ok: true, data: { status: "expired" } });

    const missing = await POST(confirmation({}));
    expect(invoke).toHaveBeenLastCalledWith({ token: "", confirmed: true });
    const wrong = await POST(confirmation({ token: "wrong" }, { "accept-language": "nl" }));
    const expired = await POST(confirmation({ token: "old" }));

    expect([missing.status, wrong.status, expired.status]).toEqual([303, 303, 303]);
    expect(missing.headers.get("location")).toBe("https://app.example.test/en/notification-emails/turn-off");
    expect(wrong.headers.get("location")).toBe("https://app.example.test/nl/notification-emails/turn-off?token=wrong");
    expect(expired.headers.get("location")).toBe("https://app.example.test/en/notification-emails/turn-off?token=old");
  });

  it("is safe to confirm twice", async () => {
    invoke.mockResolvedValue(outcome("off", { kind: "dueToday", locale: "en" }));

    const first = await POST(confirmation({ token: "abc" }));
    const second = await POST(confirmation({ token: "abc" }));

    expect(second.status).toBe(first.status);
    expect(second.headers.get("location")).toBe(first.headers.get("location"));
  });
});
