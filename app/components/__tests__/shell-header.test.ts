import type { Root } from "react-dom/client";

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/separator", () => ({
  Separator: () => createElement("span", { "data-separator": true }),
}));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => createElement("button", { "data-sidebar-trigger": true }),
}));

import { ShellHeader } from "../shell-header";
import { TopBarActionsProvider, useSetTopBarJoinedContent, useTopBarActions } from "../topbar-actions-context";

function headerClasses(joinedContentBelow?: boolean) {
  const markup = renderToStaticMarkup(
    createElement(ShellHeader, { joinedContentBelow }, createElement("span", null, "Entity")),
  );

  return markup.match(/<header class="([^"]+)"/)?.[1].split(" ") ?? [];
}

function JoinedHeader() {
  const { joinedContentBelow } = useTopBarActions();
  return createElement(ShellHeader, { joinedContentBelow }, createElement("span", null, "Entity"));
}

function JoinedContent({ joined }: { joined: boolean }) {
  useSetTopBarJoinedContent(joined);
  return null;
}

function LifecycleHarness({ joined, showContent }: { joined: boolean; showContent: boolean }) {
  return createElement(
    TopBarActionsProvider,
    null,
    createElement(JoinedHeader),
    showContent ? createElement(JoinedContent, { joined }) : null,
  );
}

function renderLifecycle(root: Root, joined: boolean, showContent: boolean) {
  flushSync(() => root.render(createElement(LifecycleHarness, { joined, showContent })));
}

describe("ShellHeader", () => {
  it("keeps its normal lower boundary by default", () => {
    expect(headerClasses()).toContain("border-b");
  });

  it("lets joined content own the single lower boundary", () => {
    const classes = headerClasses(true);

    expect(classes).toContain("border-border");
    expect(classes).not.toContain("border-b");
  });

  it("updates the real provider boundary before paint across mount, state changes, and cleanup", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    try {
      renderLifecycle(root, true, true);
      expect(container.querySelector("header")?.classList.contains("border-b")).toBe(false);

      renderLifecycle(root, false, true);
      expect(container.querySelector("header")?.classList.contains("border-b")).toBe(true);

      renderLifecycle(root, true, true);
      expect(container.querySelector("header")?.classList.contains("border-b")).toBe(false);

      renderLifecycle(root, true, false);
      expect(container.querySelector("header")?.classList.contains("border-b")).toBe(true);
    } finally {
      flushSync(() => root.unmount());
    }
  });
});
