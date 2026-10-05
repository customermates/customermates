import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { AUTH_ALLOWED_HOSTS: ["app.example.test"], BASE_URL: "https://app.example.test" },
}));

import { GET } from "../route";

describe("legacy data model route", () => {
  it("permanently redirects to Configure in the same locale and keeps every query parameter", async () => {
    const response = await GET(
      new Request("https://app.example.test/de/company/data-model?typeId=type-1&create=true&view=map"),
      { params: Promise.resolve({ locale: "de" }) },
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/de/configure?typeId=type-1&create=true&view=map",
    );
  });

  it("redirects to the plain Configure page without parameters", async () => {
    const response = await GET(new Request("https://app.example.test/en/company/data-model"), {
      params: Promise.resolve({ locale: "en" }),
    });
    expect(response.headers.get("location")).toBe("https://app.example.test/en/configure");
  });
});
