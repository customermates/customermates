import { describe, expect, it } from "vitest";

import { campaignParams, withCampaignParams } from "../campaign-link";

const PAGE =
  "https://customermates.com/de/start/crm-system?utm_source=google&utm_medium=cpc&utm_campaign=test&utm_content=test&utm_term=test&gclid=x";

describe("campaign links", () => {
  it("reads the five utm parameters and nothing else", () => {
    expect(campaignParams(new URL(PAGE).search)).toEqual([
      ["utm_source", "google"],
      ["utm_medium", "cpc"],
      ["utm_campaign", "test"],
      ["utm_content", "test"],
      ["utm_term", "test"],
    ]);
  });

  it("drops values the signup would reject", () => {
    expect(campaignParams("?utm_source=google&utm_term=%3Cscript%3E&utm_Medium=cpc&utm_id=1")).toEqual([
      ["utm_source", "google"],
    ]);
  });

  it("adds the label to this site's signup link and keeps its own parameters", () => {
    const out = new URL(withCampaignParams("/de/auth/signup?job=workspace", PAGE));
    expect(out.pathname).toBe("/de/auth/signup");
    expect(out.searchParams.get("job")).toBe("workspace");
    expect(out.searchParams.get("utm_term")).toBe("test");
    expect(out.searchParams.get("gclid")).toBeNull();
  });

  it("adds the label to the public demo", () => {
    const out = new URL(withCampaignParams("https://demo.customermates.com/de/w/kleine-unternehmen/dashboard", PAGE));
    expect(out.host).toBe("demo.customermates.com");
    expect(out.searchParams.get("utm_source")).toBe("google");
  });

  it("lets the demo's signup button carry the label back to the cloud signup", () => {
    const demoPage =
      "https://demo.customermates.com/de/w/kleine-unternehmen/inbox?utm_source=google&utm_term=crm%20system";
    const out = new URL(
      withCampaignParams("https://customermates.com/de/auth/signup?job=workspace", demoPage, {
        signupOrigins: ["https://customermates.com"],
      }),
    );
    expect(out.searchParams.get("utm_term")).toBe("crm system");
    expect(out.searchParams.get("job")).toBe("workspace");
  });

  it("leaves other links and pages without a label alone", () => {
    expect(withCampaignParams("/de/pricing", PAGE)).toBe("/de/pricing");
    expect(withCampaignParams("https://example.com/auth/signup", PAGE)).toBe("https://example.com/auth/signup");
    expect(withCampaignParams("/de/auth/signup", "https://customermates.com/de/lp/preise")).toBe("/de/auth/signup");
  });

  it("does not overwrite a campaign the link names itself", () => {
    const out = new URL(withCampaignParams("/de/auth/signup?utm_source=newsletter", PAGE));
    expect(out.searchParams.get("utm_source")).toBe("newsletter");
    expect(out.searchParams.get("utm_medium")).toBe("cpc");
  });
});
