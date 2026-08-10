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
    expect(html).toContain("@container/detail h-full min-h-[34rem]");
    expect(html).toContain("@4xl/detail:grid-cols-");
    expect(html).toContain("@6xl/detail:grid-cols-");
    expect(html).not.toContain("gap-6 p-4 md:p-6");
  });

  it("centers guarded loading cards across the full route", async () => {
    const html = renderToStaticMarkup(await RouteLoading({ route: "/legal-update" }));

    expect(html).toContain("h-full flex-1");
    expect(html).toContain("flex size-full min-h-[32rem] items-center justify-center");
    expect(html).not.toContain("gap-6 p-4 md:p-6");
  });
});
