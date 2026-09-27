import type { ReactElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock("@/components/shared/app-link", async () => {
  const { createElement } = await import("react");
  return { AppLink: (props: Record<string, unknown>) => createElement("a", props) };
});

import { NotFoundPageView } from "../not-found-page-view";

describe("NotFoundPageView", () => {
  it("declares noindex itself, because Vercel's not-found render omits the directive next start adds", async () => {
    const html = renderToStaticMarkup((await NotFoundPageView()) as ReactElement);

    expect(html).toContain('<meta content="noindex" name="robots"/>');
    expect(html).toContain("<title>NotFoundPage.documentTitle</title>");
  });
});
