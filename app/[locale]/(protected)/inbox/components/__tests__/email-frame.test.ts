import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/shared/sanitize-html", () => ({
  sanitizeHtml: (html: string) => html,
}));

vi.mock("@/ee/messaging/email-quote", () => ({
  HTML_QUOTE_HIDE_CSS: "",
  htmlContainsQuote: () => false,
}));

import { EmailFrame } from "../email-frame";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(html: string, showRemoteImages = false) {
  act(() => root?.render(createElement(EmailFrame, { html, showRemoteImages })));
  const iframe = container?.querySelector("iframe");
  if (!iframe) throw new Error("Expected an email iframe");
  return iframe;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container = null;
  document.body.replaceChildren();
});

describe("EmailFrame", () => {
  it("remounts when hydrated content changes and keeps remote images opt-in", () => {
    const first = render("<p>First</p>");
    expect(first.getAttribute("srcdoc")).toContain("<p>First</p>");
    expect(first.getAttribute("srcdoc")).toContain("img-src data:;");

    const second = render("<p>Second</p>", true);
    expect(second).not.toBe(first);
    expect(second.getAttribute("srcdoc")).toContain("<p>Second</p>");
    expect(second.getAttribute("srcdoc")).toContain("img-src data: https:;");
  });

  it("caps hostile content and shrinks a later short document", () => {
    let iframe = render('<div style="height:1000000000px">Large</div>');
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: {
        body: { offsetHeight: 1_000_000_000, scrollHeight: 1_000_000_000 },
        documentElement: { scrollHeight: 1_000_000_000 },
      },
    });

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    expect(iframe.style.height).toBe("640px");

    iframe = render('<div style="height:2000000000px">Also large</div>');
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: {
        body: { offsetHeight: 2_000_000_000, scrollHeight: 2_000_000_000 },
        documentElement: { scrollHeight: 2_000_000_000 },
      },
    });

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    expect(iframe.style.height).toBe("640px");

    iframe = render("<p>Short</p>");
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: {
        body: { offsetHeight: 40, scrollHeight: 40 },
        documentElement: {
          get scrollHeight() {
            return Number.parseInt(iframe.style.height, 10);
          },
        },
      },
    });

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    expect(iframe.style.height).toBe("96px");
  });
});
