import type { ComponentProps, ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => true,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => createElement("section", { "data-root": "popover" }, children),
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children, align: _align, onEscapeKeyDown: _onEscapeKeyDown, ...props }: Record<string, unknown>) =>
    createElement("div", { ...props, role: "dialog" }, children as ReactNode),
  PopoverHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  PopoverTitle: ({ children, ...props }: { children: ReactNode }) =>
    createElement("div", { ...props, "data-slot": "popover-title" }, children),
  PopoverFooter: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

import { ResponsiveOverlay } from "../responsive-overlay";

type TestResponsiveOverlayProps = Omit<ComponentProps<typeof ResponsiveOverlay>, "children"> & { children?: ReactNode };
const TestResponsiveOverlay = ResponsiveOverlay as ComponentType<TestResponsiveOverlayProps>;

describe("ResponsiveOverlay", () => {
  it("names the desktop popover dialog by its visible title", () => {
    const html = renderToStaticMarkup(
      createElement(
        TestResponsiveOverlay,
        {
          open: true,
          title: "Appearance",
          trigger: createElement("button", { type: "button" }, "Open"),
          onOpenChange: vi.fn(),
        },
        createElement("div", null, "Body"),
      ),
    );
    const dialog = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0] ?? "";
    const labelledBy = dialog.match(/aria-labelledby="([^"]+)"/)?.[1];
    const title = html.match(/<div[^>]*data-slot="popover-title"[^>]*>([^<]*)<\/div>/);

    expect(labelledBy).toBeTruthy();
    expect(title?.[0]).toContain(`id="${labelledBy}"`);
    expect(title?.[1]).toBe("Appearance");
  });
});
