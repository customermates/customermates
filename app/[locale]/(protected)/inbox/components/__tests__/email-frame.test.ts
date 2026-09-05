import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" }));

vi.mock("next-themes", () => ({ useTheme: () => theme }));

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
const observers: {
  resize: () => void;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];

function render(html: string, showRemoteImages = false, presentation: "email" | "composer" = "email") {
  act(() => root?.render(createElement(EmailFrame, { html, showRemoteImages, presentation })));
  const iframe = container?.querySelector("iframe");
  if (!iframe) throw new Error("Expected an email iframe");
  return iframe;
}

beforeEach(() => {
  theme.resolvedTheme = "light";
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(resize: () => void) {
        observers.push({ resize, disconnect: this.disconnect });
      }
    },
  );
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EmailFrame", () => {
  it("integrates a composer signature without changing authored typography, links or remote-image privacy", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "rgb(240, 240, 240)",
    } as unknown as CSSStyleDeclaration);
    const html =
      '<table style="color:#1a1a1a;font-family:Georgia;font-size:15px"><tr><td><a style="color:#d23128;text-decoration:none" href="https://example.com">Signature</a></td></tr></table>';
    const iframe = render(html, false, "composer");
    expect(iframe.className).toContain("bg-transparent");
    expect(iframe.style.minHeight).toBe("24px");
    expect(iframe.srcdoc).toContain("padding: 0; background: transparent");
    expect(iframe.srcdoc).toContain("color: rgb(240, 240, 240) !important");
    expect(iframe.srcdoc).toContain(html);
    expect(iframe.srcdoc).toContain("img-src data:;");
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
  });

  it("tracks the application theme for composers and keeps received-email paper unchanged", () => {
    const style = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ getPropertyValue: () => "rgb(20, 20, 20)" } as unknown as CSSStyleDeclaration);
    expect(render("<p>Signature</p>", true, "composer").srcdoc).toContain("color: rgb(20, 20, 20) !important");
    theme.resolvedTheme = "dark";
    style.mockReturnValue({
      getPropertyValue: () => "rgb(240, 240, 240)",
    } as unknown as CSSStyleDeclaration);
    const dark = render("<p>Signature</p>", true, "composer");
    expect(dark.srcdoc).toContain("color: rgb(240, 240, 240) !important");
    expect(dark.srcdoc).toContain("color-scheme: dark");
    expect(dark.srcdoc).toContain("img-src data: https:;");
    const email = render("<p>Received email</p>");
    expect(email.className).toContain("bg-white");
    expect(email.srcdoc).not.toContain("background: transparent");
    expect(email.srcdoc).not.toContain("!important");
    expect(email.style.minHeight).toBe("96px");
  });

  it("picks up the theme class when next-themes applies it after the React effect", async () => {
    const style = vi
      .spyOn(window, "getComputedStyle")
      .mockReturnValue({ getPropertyValue: () => "#fafafa" } as unknown as CSSStyleDeclaration);
    render("<p>Signature</p>", true, "composer");
    style.mockReturnValue({ getPropertyValue: () => "#000000" } as unknown as CSSStyleDeclaration);
    await act(async () => {
      document.documentElement.classList.add("light");
      await Promise.resolve();
    });
    expect(container?.querySelector("iframe")?.srcdoc).toContain("color: #000000 !important");
    document.documentElement.classList.remove("light");
  });

  it("fits a short composer signature without a reserved footer-sized area", () => {
    const iframe = render("<p>Regards</p>", false, "composer");
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: { body: { offsetHeight: 30, scrollHeight: 30 } },
    });
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    expect(iframe.style.height).toBe("30px");
  });

  it("resizes after a hidden tab becomes visible, image loads, or the viewport changes", () => {
    const iframe = render("<p>Signature preview</p>");
    let height = 0;
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: {
        body: {
          get offsetHeight() {
            return height;
          },
          get scrollHeight() {
            return height;
          },
        },
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
    const observer = observers.at(-1);
    if (!observer) throw new Error("Expected a content resize observer");
    expect(iframe.style.height).toBe("96px");
    for (const next of [268, 400, 140, 1000, 50]) {
      height = next;
      act(() => observer.resize());
      expect(iframe.style.height).toBe(`${Math.min(640, Math.max(96, next))}px`);
    }
    render("<p>Replacement</p>");
    expect(observer.disconnect).toHaveBeenCalled();
  });
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
