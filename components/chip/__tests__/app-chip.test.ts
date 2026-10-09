import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ isTruncated: false }));

vi.mock("@/core/utils/use-is-truncated", () => ({
  useIsTruncated: () => harness.isTruncated,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-tooltip-content": true }, children),
}));

import { AppChip } from "../app-chip";

const TestAppChip = AppChip as ComponentType<{
  children?: ReactNode;
  interactive?: boolean;
  tooltip?: ReactNode;
}>;

beforeEach(() => {
  harness.isTruncated = false;
});

describe("AppChip overflow tooltip accessibility", () => {
  it("shows a tooltip for a truncated plain chip without adding an implicit nested tab stop", () => {
    const fullLabel = "A deliberately long single-select option";

    const complete = renderToStaticMarkup(createElement(AppChip, null, fullLabel));

    expect(complete).not.toContain('tabindex="0"');
    expect(complete).not.toContain("data-tooltip-content");

    harness.isTruncated = true;
    const truncated = renderToStaticMarkup(createElement(AppChip, null, fullLabel));

    expect(truncated).not.toContain('tabindex="0"');
    expect(truncated).toContain(`data-tooltip-content="true">${fullLabel}</span>`);
  });

  it("does not add plain-chip keyboard semantics to interactive chips", () => {
    harness.isTruncated = true;

    const markup = renderToStaticMarkup(createElement(TestAppChip, { interactive: true }, "Truncated action"));

    expect(markup).not.toContain("tabindex=");
    expect(markup).toContain("data-tooltip-content");
  });
});

describe("AppChip tooltip repeating its own label", () => {
  const name = "Implementation workshop";
  const nestedLabel = () => createElement("button", { type: "button" }, name);

  it("shows the label of a nested element only when it is truncated", () => {
    const complete = renderToStaticMarkup(createElement(TestAppChip, null, nestedLabel()));

    expect(complete).not.toContain("data-tooltip-content");

    harness.isTruncated = true;
    const truncated = renderToStaticMarkup(createElement(TestAppChip, null, nestedLabel()));

    expect(truncated).toContain(`data-tooltip-content="true">${name}</span>`);
  });

  it("treats a tooltip equal to the label as a truncation tooltip", () => {
    expect(renderToStaticMarkup(createElement(TestAppChip, { tooltip: name }, name))).not.toContain(
      "data-tooltip-content",
    );

    harness.isTruncated = true;

    expect(renderToStaticMarkup(createElement(TestAppChip, { tooltip: name }, name))).toContain(
      `data-tooltip-content="true">${name}</span>`,
    );
  });

  it("always shows a tooltip that adds information", () => {
    const markup = renderToStaticMarkup(createElement(TestAppChip, { tooltip: "Services" }, nestedLabel()));

    expect(markup).toContain('data-tooltip-content="true">Services</span>');
  });
});
