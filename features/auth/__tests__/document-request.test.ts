import { describe, expect, it } from "vitest";

import { isDocumentRequest } from "../document-request";

describe("isDocumentRequest", () => {
  it("accepts a full page load of the browser", () => {
    expect(isDocumentRequest(new Headers({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }))).toBe(true);
  });

  it("accepts a request without fetch metadata, as older browsers and server-side callers send", () => {
    expect(isDocumentRequest(new Headers({ cookie: "app.session_token=x" }))).toBe(true);
  });

  it.each([
    ["a server action", { "next-action": "7f00", "sec-fetch-mode": "cors" }],
    ["a server action without fetch metadata", { "next-action": "7f00" }],
    ["a client-side navigation", { rsc: "1", "sec-fetch-mode": "cors" }],
    ["a prefetch without fetch metadata", { rsc: "1", "next-router-prefetch": "1" }],
    ["a fetch to a route handler", { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" }],
    ["an image or download", { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "image" }],
  ])("refuses %s", (_label, headers) => {
    expect(isDocumentRequest(new Headers(headers))).toBe(false);
  });
});
