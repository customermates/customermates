import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const receive = vi.hoisted(() => vi.fn());

vi.mock("@/core/di", () => ({
  getReceiveIncomingWebhookInteractor: () => ({ invoke: receive }),
}));

import { INCOMING_WEBHOOK_LIMITS } from "@/features/incoming-webhook/incoming-webhook.schema";
import { POST } from "../hooks/[token]/route";

const TOKEN = "a".repeat(64);

function post(body: string | null, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost:4105/api/hooks/${TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    ...(body === null ? {} : { body }),
  });
}

const context = { params: Promise.resolve({ token: TOKEN }) };

beforeEach(() => {
  vi.resetAllMocks();
  receive.mockResolvedValue({ status: 201, body: { ok: true, outcome: "created", recordId: "r1" } });
});

describe("POST /api/hooks/[token]", () => {
  it("hands the token, the raw body and a header reader to the interactor and returns its answer", async () => {
    const response = await POST(post('{"a":1}', { "x-signature": "abc" }), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, outcome: "created", recordId: "r1" });
    const input = receive.mock.calls[0][0];
    expect(input.token).toBe(TOKEN);
    expect(input.body).toBe('{"a":1}');
    expect(input.header("x-signature")).toBe("abc");
    expect(input.header("x-missing")).toBeNull();
  });

  it("passes an empty body through so the interactor can refuse it", async () => {
    await POST(post(null), context);

    expect(receive.mock.calls[0][0].body).toBe("");
  });

  it("answers 413 without calling the interactor when the declared length is over the limit", async () => {
    const response = await POST(
      post("{}", { "content-length": String(INCOMING_WEBHOOK_LIMITS.maxBodyBytes + 1) }),
      context,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: "payload_too_large" });
    expect(receive).not.toHaveBeenCalled();
  });

  it("answers 413 when the streamed body is over the limit although no length was declared", async () => {
    const big = JSON.stringify({ filler: "x".repeat(INCOMING_WEBHOOK_LIMITS.maxBodyBytes) });

    const response = await POST(post(big), context);

    expect(response.status).toBe(413);
    expect(receive).not.toHaveBeenCalled();
  });

  it("accepts a body exactly at the limit", async () => {
    const body = "x".repeat(INCOMING_WEBHOOK_LIMITS.maxBodyBytes);

    await POST(post(body), context);

    expect(receive.mock.calls[0][0].body).toHaveLength(INCOMING_WEBHOOK_LIMITS.maxBodyBytes);
  });

  it("sends Retry-After with a 429", async () => {
    receive.mockResolvedValue({
      status: 429,
      body: { ok: false, error: "rate_limited" },
      retryAfterSeconds: 12,
    });

    const response = await POST(post("{}"), context);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
  });

  it("does not send Retry-After on other answers", async () => {
    const response = await POST(post("{}"), context);

    expect(response.headers.get("Retry-After")).toBeNull();
  });

  describe("visitor", () => {
    const visitor = () => receive.mock.calls[0][0].visitor as string | null;

    it("hashes the client address and never passes it on in clear", async () => {
      await POST(post("{}", { "x-real-ip": "203.0.113.9" }), context);

      expect(visitor()).toMatch(/^[0-9a-f]{32}$/u);
      expect(visitor()).not.toContain("203");
    });

    it("takes the last forwarded address, which the proxy added, not the first one the client may have set", async () => {
      await POST(post("{}", { "x-forwarded-for": "198.51.100.1, 203.0.113.9" }), context);
      const forwarded = visitor();
      receive.mockClear();
      await POST(post("{}", { "x-real-ip": "203.0.113.9" }), context);

      expect(forwarded).toBe(visitor());
    });

    it("prefers the platform header over the others", async () => {
      await POST(post("{}", { "x-vercel-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.7" }), context);
      const platform = visitor();
      receive.mockClear();
      await POST(post("{}", { "x-real-ip": "203.0.113.9" }), context);

      expect(platform).toBe(visitor());
    });

    it("is null when no address is known", async () => {
      await POST(post("{}"), context);

      expect(visitor()).toBeNull();
    });
  });
});
