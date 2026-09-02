import { describe, expect, it } from "vitest";

import { scrubAdIdentifiersFromEvent, scrubAdIdentifiersFromUrl } from "../scrub-ad-identifiers";

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

  it("tolerates an event carrying no request URL", () => {
    expect(scrubAdIdentifiersFromEvent({} as { request?: { url?: string } }).request).toBeUndefined();
  });
});
