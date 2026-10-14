import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/utils/use-is-truncated", () => ({ useIsTruncated: () => false }));
vi.mock("@/components/shared/use-navigate-to-href", () => ({ useNavigateToHref: () => vi.fn() }));

import { AppChipStack } from "../app-chip-stack";

const items = [{ id: "a", label: "Docking" }];
const moreButtons = (markup: string) =>
  markup.match(/<button[^>]*>(?:(?!<\/button>).)*\+2(?:(?!<\/button>).)*<\/button>/g) ?? [];

describe("chip stack overflow count", () => {
  it("counts unseen records in one +N and opens the record from it when asked", () => {
    const markup = renderToStaticMarkup(createElement(AppChipStack, { items, extraCount: 2, onMoreClick: vi.fn() }));

    expect(moreButtons(markup)).toHaveLength(1);
  });

  it("shows a plain +N count when nothing handles the click", () => {
    const markup = renderToStaticMarkup(createElement(AppChipStack, { items, extraCount: 2 }));

    expect(markup).toContain("+2");
    expect(moreButtons(markup)).toHaveLength(0);
  });
});
