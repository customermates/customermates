import { describe, expect, it, vi } from "vitest";

import { publicOAuthMetadata, withoutApiKey } from "../oauth-discovery-request";

const URL_ = "https://customermates.com/.well-known/oauth-protected-resource";

describe("public OAuth discovery documents", () => {
  it("hand the auth library the request without the API key a client sends on every call (20 Nov: five 403s reported as errors)", async () => {
    const handler = vi.fn((request: Request) =>
      Promise.resolve(new Response(JSON.stringify({ sawApiKey: request.headers.has("x-api-key") }), { status: 200 })),
    );
    const request = new Request(URL_, {
      headers: { "x-api-key": "cm_live_example", accept: "application/json" },
    });

    const response = await publicOAuthMetadata(handler)(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sawApiKey: false });
    const forwarded = handler.mock.calls[0][0];
    expect(forwarded.url).toBe(URL_);
    expect(forwarded.method).toBe("GET");
    expect(forwarded.headers.get("accept")).toBe("application/json");
  });

  it("pass a request without an API key through unchanged", () => {
    const request = new Request(URL_, {
      headers: { accept: "application/json" },
    });

    expect(withoutApiKey(request)).toBe(request);
  });
});
