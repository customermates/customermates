import { describe, expect, it, vi } from "vitest";

import { readWebsiteBrand } from "../workspace-setup-brand";

describe("website brand colours", () => {
  it("reads the homepage, its manifest and stylesheets within the site and maps the colour", async () => {
    const fetch = vi.fn((url: string) => {
      if (url === "https://studio.example/") {
        return Promise.resolve({
          ok: true as const,
          url,
          contentType: "text/html",
          truncated: false,
          body: '<html><head><link rel="manifest" href="/site.webmanifest"><link rel="stylesheet" href="/a.css"><link rel="icon" href="/x.png"></head></html>',
        });
      }
      if (url.endsWith("site.webmanifest")) {
        return Promise.resolve({
          ok: true as const,
          url,
          contentType: "application/manifest+json",
          truncated: false,
          body: JSON.stringify({ theme_color: "#16A34A" }),
        });
      }
      return Promise.resolve({ ok: false as const, reason: "unavailable" as const });
    });
    const brand = await readWebsiteBrand("https://studio.example/", fetch);
    expect(brand).toMatchObject({ hex: "#16a34a", chip: "success" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://studio.example/",
      "https://studio.example/site.webmanifest",
      "https://studio.example/a.css",
    ]);
  });

  it("returns no colour when the homepage cannot be read", async () => {
    const fetch = vi.fn(() => Promise.resolve({ ok: false as const, reason: "robots" as const }));
    await expect(readWebsiteBrand("https://studio.example/", fetch)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
