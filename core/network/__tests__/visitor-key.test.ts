import { describe, expect, it } from "vitest";

import { visitorKey } from "../visitor-key";

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

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

  it("prefers the platform header over the others", async () => {
    const platform = await visitorKey(
      request({ "x-vercel-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.7" }),
    );

    expect(platform).toBe(await visitorKey(request({ "x-real-ip": "203.0.113.9" })));
  });

  it("is null when no address is known", async () => {
    expect(await visitorKey(request({}))).toBeNull();
  });
});
