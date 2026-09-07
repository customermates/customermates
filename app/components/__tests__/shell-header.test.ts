import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/separator", () => ({
  Separator: () => createElement("span", { "data-separator": true }),
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => createElement("button", { "data-sidebar-trigger": true }),
}));

import { ShellHeader } from "../shell-header";

const JOINED_STRIPS = [
  "components/data-view/views/data-view-views-rail.tsx",
  "components/entity-detail/entity-detail-summary.tsx",
  "components/entity-detail/entity-detail-page-skeleton.tsx",
];

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function headerClasses() {
  const markup = renderToStaticMarkup(createElement(ShellHeader, null, createElement("span", null, "Entity")));

  return markup.match(/<header class="([^"]+)"/)?.[1].split(" ") ?? [];
}

describe("ShellHeader", () => {
  it("always draws its own lower boundary", () => {
    expect(headerClasses()).toContain("border-b");
    expect(headerClasses()).toContain("border-border");
  });

  it("lets the shell drop that boundary through CSS when a joined strip follows it", () => {
    const shell = source("app/components/navigation/navigation-switch.tsx");

    expect(shell).toContain("[&:has([data-joins-top-bar])>header]:border-b-0");
  });

  it("decides the joined boundary in the server markup rather than after hydration", () => {
    const context = source("app/components/topbar-actions-context.tsx");

    expect(context).not.toContain("joinedContentBelow");
    expect(context).not.toContain("useSetTopBarJoinedContent");
    expect(source("app/components/shell-header.tsx")).not.toContain("joinedContentBelow");
  });

  it("has every strip that joins the top bar mark itself", () => {
    for (const path of JOINED_STRIPS) expect(source(path), path).toContain("data-joins-top-bar");
  });
});
