import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RouteLoading } from "../route-loading";

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));

describe("RouteLoading geometry", () => {
  it("keeps detail loading flush and full-height", async () => {
    const html = renderToStaticMarkup(await RouteLoading({ route: "/contacts/[id]" }));

    expect(html).toContain("h-[calc(100svh-4rem)]");
    expect(html).toContain("@container/detail flex h-full min-h-0");
    expect(html).toContain("@4xl/detail:grid-cols-");
    expect(html).toContain("@6xl/detail:grid-cols-");
    expect(html).not.toContain('id="scroll-container"');
    expect(html).not.toContain("gap-6 p-4 md:p-6");
  });

  it("centers guarded loading cards across the full route", async () => {
    const html = renderToStaticMarkup(await RouteLoading({ route: "/legal-update" }));

    expect(html).toContain("h-full flex-1");
    expect(html).toContain("flex min-h-full w-full items-center justify-center p-4");
    expect(html).toContain("max-w-2xl");
    expect(html).not.toContain('id="scroll-container"');
    expect(html).not.toContain("gap-6 p-4 md:p-6");
  });
});
