import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" }));

vi.mock("next-themes", () => ({ useTheme: () => theme }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/ee/messaging/email-quote", () => ({
  HTML_QUOTE_HIDE_CSS: "",
  htmlContainsQuote: () => false,
}));

import { EmailFrame } from "../email-frame";
import { sanitizeEmailCss, sanitizeEmailFrameResources } from "../email-frame-resources";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const observers: {
  resize: () => void;
  disconnect: ReturnType<typeof vi.fn>;
}[] = [];

describe("email resource policies", () => {
  const image = "data:image/png;base64,AA==";
  const font = "data:font/woff2;base64,AA==";
  const base = "https://example.test/mail";
  const css = (input: string, optIn = false) => sanitizeEmailCss(input, optIn, base);
  const resources = (html: string, optIn = false) => {
    const document = new DOMParser().parseFromString(html, "text/html");
    sanitizeEmailFrameResources(document.documentElement, optIn, base);
    return document;
  };

  it("preserves authored styling and literal URL text exactly when no resource needs removal", () => {
    const authored = `/* url(https://example.test/comment) */.x{color:#123;display:grid;content:"url(https://example.test/literal)";--label:"url(https://example.test/text)";background:url("${image}")}@supports(background:url(https://example.test/condition)){.x{margin:4px}}`;
    expect(css(authored)).toBe(authored);
  });

  it.each([
    'u\\72l("https://example.test/image")',
    '\\75 rl("\\68 ttps://example.test/image")',
    'u\\000072 l("https://example.test/image")',
    "URL(https://example.test/image)",
    "url(\\68 ttps://example.test/image)",
  ])("defers an escaped image URL while preserving its layout: %s", (url) => {
    const result = css(`.x{background:red ${url} center/cover no-repeat,url("${image}");padding:4px;display:grid}`);
    expect(result).not.toContain("example.test/image");
    expect(result).toContain("data:image/png;base64,");
    expect(result).toContain(image);
    expect(result).toContain("background:red");
    expect(result).toContain("center/cover no-repeat");
    expect(result).toContain("padding:4px;display:grid");
  });

  it.each(["import", "\\69 mport", "\\000069mport", "IMPORT"])(
    "removes stylesheet import %s without removing independent styles",
    (keyword) => {
      expect(css(`@${keyword} url(https://example.test/import.css);.x{color:red}`, true)).toBe(".x{color:red}");
    },
  );

  it.each([false, true])(
    "filters remote font candidates while preserving local and data candidates (image opt-in: %s)",
    (optIn) => {
      const result = css(
        `@font-face{font-family:Probe;src:local("Public Probe"),url(https://example.test/font.woff2) format("woff2"),url("${font}") format("woff2") tech(variations);font-weight:400}.x{color:red}`,
        optIn,
      );
      expect(result).toContain('local("Public Probe")');
      expect(result).toContain(font);
      expect(result).toContain('format("woff2") tech(variations)');
      expect(result).toContain("font-weight:400");
      expect(result).toContain(".x{color:red}");
      expect(result).not.toContain("example.test/font");
      expect(result).not.toContain("data:image/");
      expect(css("@font-face{font-family:Probe;src:url(https://example.test/font)}.x{color:red}", optIn)).toBe(
        ".x{color:red}",
      );
    },
  );

  it("filters custom properties and image-set candidates without changing quoted text", () => {
    const result = css(
      `.x{--asset:u\\72l("https://example.test/custom");background:image-set("https://example.test/image" 1x,url("${image}") 2x);content:"url(https://example.test/literal)"}`,
    );
    expect(result).not.toContain("example.test/custom");
    expect(result).not.toContain("example.test/image");
    expect(result).toContain(" 1x");
    expect(result).toContain(" 2x");
    expect(result).toContain(image);
    expect(result).toContain('content:"url(https://example.test/literal)"');
  });

  it("applies font policy to variables shared across stylesheets", () => {
    const document = resources(
      `<head><style>:root{--font:url(https://example.test/font)}</style><style>@font-face{font-family:Probe;src:var(--font),url("${font}")}.x{color:red}</style></head>`,
    );
    const result = document.documentElement.outerHTML;
    expect(result).toContain(font);
    expect(result).toContain(".x{color:red}");
    expect(result).not.toContain("var(--font)");
    expect(result).not.toContain("example.test/font");
    expect(result).not.toContain("data:image/");
  });

  it("retains local fragments and HTTPS image opt-in while continuing to block HTTP resources", () => {
    const input = `.x{background:url(https://example.test/image),url(http://example.test/blocked),url(/relative),url("${image}");filter:url(#local);content:"url(https://example.test/literal)"}`;
    const result = css(input, true);
    expect(result).toContain("https://example.test/image");
    expect(result).not.toContain("http://example.test/blocked");
    expect(result).toContain("url(/relative)");
    expect(result).toContain(image);
    expect(result).toContain("filter:url(#local)");
    expect(result).toContain('content:"url(https://example.test/literal)"');
    expect(sanitizeEmailCss(".x{background:url(/relative)}", true, "http://example.test/mail")).not.toContain(
      "url(/relative)",
    );
  });

  it.each(['.x{background:url("https://example.test/image)', "/* unfinished", ".x{color:red"])(
    "drops malformed CSS without returning blocked input: %s",
    (input) => {
      expect(css(input)).toBe("");
    },
  );

  it("filters mixed srcsets and eager media without changing links, alternative text or dimensions", () => {
    const document = resources(
      `<body background="https://example.test/background"><a href="https://example.test/link">Link</a><img id="remote" alt="Public alternative" width="80" height="40" src="https://example.test/image"><img id="mixed" src="${image}" srcset="${image} 1x, https://example.test/blocked 2x, ${image} 300w 200h"><picture><source srcset="${image} 1x, https://example.test/blocked 2x"></picture><video src="https://example.test/video" poster="${image}"><source src="https://example.test/media"></video></body>`,
    );
    expect(document.querySelector("a")?.getAttribute("href")).toBe("https://example.test/link");
    const remote = document.querySelector("#remote");
    expect(remote?.getAttribute("src")).toBeNull();
    expect(remote?.getAttribute("alt")).toBe("Public alternative");
    expect(remote?.getAttribute("width")).toBe("80");
    expect(remote?.getAttribute("height")).toBe("40");
    expect(document.querySelector("#mixed")?.getAttribute("src")).toBe(image);
    expect(document.querySelector("#mixed")?.getAttribute("srcset")).toBe(`${image} 1x, ${image} 300w 200h`);
    expect(document.querySelector("picture source")?.getAttribute("srcset")).toBe(`${image} 1x`);
    expect(document.body.getAttribute("background")).toBeNull();
    expect(document.querySelector("video")?.getAttribute("src")).toBeNull();
    expect(document.querySelector("video")?.getAttribute("poster")).toBe(image);
    expect(document.querySelector("video source")?.getAttribute("src")).toBeNull();
  });

  it("applies the same resource policy to root styling and SVG presentation attributes", () => {
    const document = resources(
      '<html background="https://example.test/root" style="color:red;padding:5px;background-image:url(https://example.test/root)"><body><svg><rect id="local" fill="url(#paint)" stroke="red" filter="url(#filter)"></rect><rect id="remote" fill="url(https://example.test/paint.svg#p) blue" stroke="url(https://example.test/stroke.svg#s)" filter="url(https://example.test/filter.svg#f) blur(4px)" clip-path="url(https://example.test/clip.svg#c)"></rect></svg><p>Public message</p></body></html>',
    );
    expect(document.documentElement.getAttribute("background")).toBeNull();
    expect(document.documentElement.style.color).toBe("red");
    expect(document.documentElement.style.padding).toBe("5px");
    expect(document.documentElement.getAttribute("style")).not.toContain("example.test/root");
    expect(document.querySelector("#local")?.getAttribute("fill")).toBe("url(#paint)");
    expect(document.querySelector("#local")?.getAttribute("filter")).toBe("url(#filter)");
    expect(document.querySelector("#remote")?.getAttribute("fill")).toBe("blue");
    expect(document.querySelector("#remote")?.getAttribute("stroke")).toBe("none");
    expect(document.querySelector("#remote")?.getAttribute("filter")).toBe("blur(4px)");
    expect(document.querySelector("#remote")?.getAttribute("clip-path")).toBe("none");
    expect(document.body.textContent).toBe("Public message");
  });

  it("resolves opted-in relative images against the frame base while retaining data sources", () => {
    const document = resources(
      `<img src="/allowed.png" srcset="/candidate.png 1x, http://example.test/blocked 2x, ${image} 3x">`,
      true,
    );
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://example.test/allowed.png");
    expect(document.querySelector("img")?.getAttribute("srcset")).toBe(
      `https://example.test/candidate.png 1x, ${image} 3x`,
    );
  });
});

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
  it.each(["light", "dark"])("keeps received HTML on its original canvas in the %s app theme", (appTheme) => {
    theme.resolvedTheme = appTheme;
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "rgb(240, 240, 240)",
    } as unknown as CSSStyleDeclaration);
    for (const html of [
      '<p>Hello <strong>Alex</strong>. <a href="https://example.test">Review</a></p>',
      '<p style="color:black">Authored color</p>',
      '<div style="background:#121212;color:#fafafa"><p>Authored dark palette</p></div>',
      "<table><tr><td>Layout</td></tr></table>",
      '<img src="https://example.test/image.png">',
    ]) {
      const authored = render(html);
      expect(authored.className).toContain("bg-white");
      expect(authored.srcdoc).not.toContain("background: transparent");
      expect(authored.srcdoc).not.toContain("color: rgb(240, 240, 240)");
      expect(authored.srcdoc).not.toContain("!important");
      const received = new DOMParser().parseFromString(authored.srcdoc, "text/html");
      const original = new DOMParser().parseFromString(html, "text/html");
      expect(received.body.textContent).toBe(original.body.textContent);
      expect(received.body.querySelector("[style]")?.getAttribute("style")).toBe(
        original.body.querySelector("[style]")?.getAttribute("style"),
      );
      expect(authored.getAttribute("sandbox")).toBe("allow-same-origin");
      expect(authored.srcdoc).toContain("img-src data:;");
    }
  });
  it("preserves head styles and body attributes while keeping active content and image requests blocked", () => {
    const html =
      '<html><head><style>.palette{background:#102138;color:#dcecff}</style></head><body style="background:#edf1f5" bgcolor="#edf1f5" text="#203348" onload="alert(1)"><div class="palette">Authored HTML</div><img src="https://example.test/image.png" onerror="alert(1)"><script>alert(1)</script><iframe src="https://example.test"></iframe></body></html>';
    const iframe = render(html);

    expect(iframe.srcdoc).toContain(".palette{background:#102138;color:#dcecff}");
    expect(iframe.srcdoc).toContain('style="background:#edf1f5"');
    expect(iframe.srcdoc).toContain('bgcolor="#edf1f5"');
    expect(iframe.srcdoc).toContain('text="#203348"');
    expect(iframe.srcdoc.indexOf("Content-Security-Policy")).toBeLessThan(iframe.srcdoc.indexOf(".palette"));
    expect(iframe.srcdoc).not.toMatch(/<script|<iframe|onload|onerror/);
    expect(iframe.srcdoc).toContain("img-src data:;");
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
  });
  it.each(['id="authored-head"', 'class="authored-head"', 'data-theme="dark"', 'title="quoted > <head>"'])(
    "enforces frame policies for an attributed head: %s",
    (headAttributes) => {
      const html = `<html data-content="<head>"><head ${headAttributes}><style>.palette{color:#123456}</style></head><body><p class="palette">Authored email</p><img src="https://example.test/image.png"></body></html>`;
      for (const showRemoteImages of [false, true]) {
        const iframe = render(html, showRemoteImages);
        const frame = new DOMParser().parseFromString(iframe.srcdoc, "text/html");
        const policy = frame.head.querySelector('meta[http-equiv="Content-Security-Policy"]');
        expect(policy?.getAttribute("content")).toContain("default-src 'none'");
        expect(policy?.getAttribute("content")).toContain(
          showRemoteImages ? "img-src data: https:;" : "img-src data:;",
        );
        expect(frame.head.querySelector("base")?.target).toBe("_blank");
        expect(frame.head.querySelector("style")?.textContent).toContain("background: #ffffff");
        expect(frame.head.querySelectorAll("style")[1]?.textContent).toBe(".palette{color:#123456}");
        expect(frame.head.attributes.length).toBeGreaterThan(0);
        expect(frame.body.textContent).toBe("Authored email");
        expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
      }
    },
  );
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
    expect(iframe.srcdoc).toContain("font-family:Georgia;font-size:15px");
    expect(iframe.srcdoc).toContain('style="color:#d23128;text-decoration:none"');
    expect(iframe.srcdoc).toContain('href="https://example.com"');
    expect(iframe.srcdoc).toContain("img-src data:;");
    expect(iframe.getAttribute("sandbox")).toBe("allow-same-origin");
  });

  it("tracks the application theme for composers and keeps received-email paper unchanged", () => {
    const style = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "rgb(20, 20, 20)",
    } as unknown as CSSStyleDeclaration);
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
    const style = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: () => "#fafafa",
    } as unknown as CSSStyleDeclaration);
    render("<p>Signature</p>", true, "composer");
    style.mockReturnValue({
      getPropertyValue: () => "#000000",
    } as unknown as CSSStyleDeclaration);
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
