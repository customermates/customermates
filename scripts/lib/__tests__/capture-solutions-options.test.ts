import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPTURE_BASE_URL,
  captureNavigationUrl,
  isLoopbackBaseUrl,
  parseCaptureSolutionsArgs,
} from "../capture-solutions-options";

describe("capture-solutions options", () => {
  it("defaults to capturing from the local demo instance", () => {
    expect(parseCaptureSolutionsArgs([])).toEqual({
      allowDirty: false,
      allowPlaceholders: false,
      baseUrl: DEFAULT_CAPTURE_BASE_URL,
      mode: "capture",
      navOnly: false,
      only: [],
      resetDatabase: false,
    });
  });

  it("parses check, placeholder and capture flags", () => {
    expect(parseCaptureSolutionsArgs(["--check", "--allow-placeholders"])).toMatchObject({
      allowPlaceholders: true,
      mode: "check",
    });
    expect(parseCaptureSolutionsArgs(["--placeholders"]).mode).toBe("placeholders");
    expect(
      parseCaptureSolutionsArgs(["--base-url", "http://localhost:4600/", "--only", "smb,agencies", "--reset-db"]),
    ).toMatchObject({ baseUrl: "http://localhost:4600", only: ["smb", "agencies"], resetDatabase: true });
    expect(parseCaptureSolutionsArgs(["--nav-only"]).navOnly).toBe(true);
  });

  it("refuses remote hosts, unknown flags and missing values", () => {
    expect(isLoopbackBaseUrl("https://demo.customermates.com")).toBe(false);
    expect(isLoopbackBaseUrl("http://127.0.0.1:3000")).toBe(true);
    expect(() => parseCaptureSolutionsArgs(["--base-url", "https://demo.customermates.com"])).toThrow("local demo");
    expect(() => parseCaptureSolutionsArgs(["--nope"])).toThrow("Unknown argument");
    expect(() => parseCaptureSolutionsArgs(["--only"])).toThrow("needs a value");
  });

  it("closes the assistant in the captured URL", () => {
    expect(captureNavigationUrl("http://127.0.0.1:3000", "/en/w/small-business/dashboard")).toBe(
      "http://127.0.0.1:3000/en/w/small-business/dashboard?agentChat=closed",
    );
    expect(captureNavigationUrl("http://127.0.0.1:3000", "/en/w/whatsapp/inbox?threadId=t1")).toBe(
      "http://127.0.0.1:3000/en/w/whatsapp/inbox?threadId=t1&agentChat=closed",
    );
  });
});
