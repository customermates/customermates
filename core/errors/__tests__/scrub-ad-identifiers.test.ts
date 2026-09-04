import { describe, expect, it } from "vitest";

import {
  scrubAdIdentifiersFromEvent,
  scrubAdIdentifiersFromQueryString,
  scrubAdIdentifiersFromUrl,
} from "../scrub-ad-identifiers";

describe("scrubbing ad identifiers from error reports", () => {
  it.each(["gclid", "gbraid", "wbraid", "oppref", "rdt_cid", "li_fat_id"])(
    "removes a %s carried in the reported URL",
    (kind) => {
      const scrubbed = scrubAdIdentifiersFromUrl(`https://app.example/en/pricing?${kind}=Secret_Value&page=2`);

      expect(scrubbed).not.toContain("Secret_Value");
      expect(scrubbed).toContain("page=2");
    },
  );

  it("removes the pending marker and keeps the path and fragment", () => {
    expect(
      scrubAdIdentifiersFromUrl("https://app.example/en/privacy?oppref=abc&cm_ads_pending=1788170400#choices"),
    ).toBe("https://app.example/en/privacy#choices");
  });

  it("leaves a URL without any advertising parameter untouched", () => {
    const url = "https://app.example/en/pricing?utm_source=google&page=2";

    expect(scrubAdIdentifiersFromUrl(url)).toBe(url);
    expect(scrubAdIdentifiersFromUrl("https://app.example/en/pricing")).toBe("https://app.example/en/pricing");
  });

  it("scrubs the request URL on a reported event", () => {
    const event = { request: { url: "https://app.example/?gclid=Secret_Value" } };

    expect(scrubAdIdentifiersFromEvent(event).request.url).toBe("https://app.example/");
  });

  it("scrubs a bare query string, which carries no leading question mark", () => {
    expect(scrubAdIdentifiersFromQueryString("gclid=Secret_Value&page=2")).toBe("page=2");
    expect(scrubAdIdentifiersFromQueryString("page=2")).toBe("page=2");
  });

  it.each([
    ["a string", "gclid=Secret_Value&page=2", "page=2"],
    [
      "a record",
      { gclid: "Secret_Value", page: "2" } as Record<string, string>,
      { page: "2" } as Record<string, string>,
    ],
    [
      "pairs",
      [
        ["gclid", "Secret_Value"],
        ["page", "2"],
      ] as [string, string][],
      [["page", "2"]] as [string, string][],
    ],
  ])("scrubs request.query_string given as %s", (_shape, given, expected) => {
    const event = { request: { query_string: given } };

    expect(scrubAdIdentifiersFromEvent(event).request.query_string).toEqual(expected);
    expect(JSON.stringify(event)).not.toContain("Secret_Value");
  });

  it("scrubs the referer header, which carries the un-cleaned landing URL", () => {
    const event = {
      request: { headers: { Referer: "https://app.example/en/pricing?gclid=Secret_Value" } as Record<string, string> },
    };

    expect(scrubAdIdentifiersFromEvent(event).request.headers.Referer).toBe("https://app.example/en/pricing");
  });

  it("scrubs navigation breadcrumbs, which record the URL on both sides of a replaceState", () => {
    const event = {
      breadcrumbs: [
        {
          data: {
            from: "/en/pricing?gclid=Secret_Value",
            to: "/en/pricing?gclid=Secret_Value&cm_ads_pending=1788170400",
          } as Record<string, unknown>,
        },
        { data: { to: "/en/privacy" } as Record<string, unknown> },
        {},
      ],
    };

    const scrubbed = scrubAdIdentifiersFromEvent(event);

    expect(JSON.stringify(scrubbed)).not.toContain("Secret_Value");
    expect(scrubbed.breadcrumbs[0]?.data?.to).toBe("/en/pricing");
    expect(scrubbed.breadcrumbs[1]?.data?.to).toBe("/en/privacy");
  });

  it("tolerates an event carrying no request URL", () => {
    expect(scrubAdIdentifiersFromEvent({} as { request?: { url?: string } }).request).toBeUndefined();
  });
});
