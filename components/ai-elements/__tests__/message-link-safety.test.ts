import { describe, expect, it } from "vitest";

import { messageLinkSafety } from "../message-link-safety";

const pageId = "fbdddad0-7f4f-4159-bc04-20c5ae6d666b";

describe("message Wiki link safety", () => {
  it("opens the exact internal Wiki page URL without an external-site prompt", () => {
    expect(messageLinkSafety.enabled).toBe(true);
    expect(messageLinkSafety.onLinkCheck?.(`/wiki?page=${pageId}`)).toBe(true);
  });

  it.each([
    `https://example.com/wiki?page=${pageId}`,
    `//example.com/wiki?page=${pageId}`,
    `/\\example.com/wiki?page=${pageId}`,
    `/wiki?page=${pageId}&redirect=https://example.com`,
    `/wiki?page=${pageId}#https://example.com`,
    `/wiki?page=${pageId}/..`,
    "/wiki?page=not-a-uuid",
    "/wiki",
    "/api/v1/mcp",
    "javascript:alert(1)",
    "streamdown:incomplete-link",
  ])("retains existing external-link checks for %s", (url) => {
    expect(messageLinkSafety.onLinkCheck?.(url)).toBe(false);
  });
});
