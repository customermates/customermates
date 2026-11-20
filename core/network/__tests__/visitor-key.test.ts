import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({ VERCEL_ENV: undefined as "production" | "preview" | "development" | undefined }));

vi.mock("@/env", () => ({ env: mockEnv }));

import { visitorKey } from "../visitor-key";

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

beforeEach(() => {
  mockEnv.VERCEL_ENV = undefined;
});

describe("visitorKey", () => {
  it("hashes the client address and never returns it in clear", async () => {
    const key = await visitorKey(request({ "x-real-ip": "203.0.113.9" }));

    expect(key).toMatch(/^[0-9a-f]{32}$/u);
    expect(key).not.toContain("203");
  });

  it("takes the last forwarded address, which the proxy added, not the first one the client may have set", async () => {
    const forwarded = await visitorKey(request({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }));

    expect(forwarded).toBe(await visitorKey(request({ "x-real-ip": "203.0.113.9" })));
  });

  it("prefers the platform header over the others on the platform that sets it", async () => {
    mockEnv.VERCEL_ENV = "production";

    const platform = await visitorKey(
      request({ "x-vercel-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.7" }),
    );

    expect(platform).toBe(await visitorKey(request({ "x-real-ip": "203.0.113.9" })));
  });

  it("ignores the platform header on a server that is not behind that platform, where any client can set it", async () => {
    const spoofed = (address: string) =>
      visitorKey(request({ "x-vercel-forwarded-for": address, "x-forwarded-for": "203.0.113.9" }));

    expect(await spoofed("198.51.100.1")).toBe(await spoofed("198.51.100.2"));
    expect(await spoofed("198.51.100.1")).toBe(await visitorKey(request({ "x-real-ip": "203.0.113.9" })));
    expect(await visitorKey(request({ "x-vercel-forwarded-for": "198.51.100.1" }))).toBeNull();
  });

  it("is null when no address is known", async () => {
    expect(await visitorKey(request({}))).toBeNull();
  });
});
