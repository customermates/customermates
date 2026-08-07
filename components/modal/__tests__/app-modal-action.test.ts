import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipTrigger: ({ asChild, children }: { asChild?: boolean; children: ReactNode }) =>
    createElement("span", { "data-as-child": asChild ? "" : undefined, "data-slot": "tooltip-trigger" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

import { AppModalAction, type AppModalActionProps } from "../app-modal-action";

function renderAction(props: AppModalActionProps) {
  return renderToStaticMarkup(createElement(AppModalAction, props));
}

describe("AppModalAction", () => {
  it("owns the neutral button footprint, label, tooltip, and button semantics", () => {
    const html = renderAction({
      id: "refresh",
      icon: RefreshCw,
      label: "Refresh",
      disabled: true,
      onClick: vi.fn(),
    });

    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Refresh"');
    expect(html).toContain('data-overlay-action=""');
    expect(html).toContain('data-size="icon"');
    expect(html).toContain('data-slot="app-modal-action"');
    expect(html).toContain('data-variant="neutral"');
    expect(html).toContain('data-as-child=""');
    expect(html).toContain("size-9");
    expect(html).not.toContain("size-8");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-slot="tooltip-content">Refresh</span>');
  });

  it("keeps destructive styling semantic without changing the shared footprint", () => {
    const html = renderAction({
      id: "delete",
      icon: Trash2,
      label: "Delete",
      variant: "destructive",
      onClick: vi.fn(),
    });

    expect(html).toContain('data-variant="destructive"');
    expect(html).toContain("size-9");
    expect(html).toContain("text-destructive");
    expect(html).not.toContain("bg-destructive text-white");
  });

  it("makes busy mutations disabled, announced, and visibly active", () => {
    const html = renderAction({
      id: "resend",
      icon: RefreshCw,
      label: "Resend",
      busy: true,
      onClick: vi.fn(),
    });

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
    expect(html).toContain("animate-spin");
  });

  it("owns safe internal and external link rendering", () => {
    const internal = renderAction({
      id: "open-inbox",
      icon: ExternalLink,
      label: "Open in Inbox",
      href: "/inbox?threadId=1",
    });
    const external = renderAction({
      id: "join-meeting",
      icon: ExternalLink,
      label: "Join meeting",
      href: "https://example.com/meeting",
      external: true,
    });

    expect(internal).toContain('href="/inbox?threadId=1"');
    expect(internal).toContain('aria-label="Open in Inbox"');
    expect(internal).toContain('data-overlay-action=""');
    expect(internal).toContain('data-size="icon"');
    expect(internal).toContain('data-slot="tooltip-content">Open in Inbox</span>');
    expect(internal).not.toContain('target="_blank"');
    expect(external).toContain('target="_blank"');
    expect(external).toContain('rel="noopener noreferrer"');
  });
});
