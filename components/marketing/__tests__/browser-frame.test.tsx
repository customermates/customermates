import type { Root } from "react-dom/client";
import type { ReactNode } from "react";
import type * as ReactDOM from "react-dom";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resourceHints = vi.hoisted(() => ({
  preconnect: vi.fn(),
  prefetchDNS: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactDOM>()),
  preconnect: resourceHints.preconnect,
  prefetchDNS: resourceHints.prefetchDNS,
}));

import { HeroDemoIframe } from "@/app/[locale]/(static)/components/hero-demo-iframe";
import { ProductDemo } from "../product-demo";
import { DocsDemo } from "@/core/fumadocs/docs-demo";
import { localProductDemoSrc } from "../product-demo-src";

const observer = {
  callback: undefined as IntersectionObserverCallback | undefined,
  disconnect: vi.fn(),
  observe: vi.fn(),
  options: undefined as IntersectionObserverInit | undefined,
};
const roots = new Set<Root>();

function mount(node: ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);

  act(() => root.render(node));

  return host;
}

function setIntersection(isIntersecting: boolean): void {
  act(() => {
    observer.callback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  observer.callback = undefined;
  observer.disconnect.mockReset();
  observer.observe.mockReset();
  observer.options = undefined;
  resourceHints.preconnect.mockReset();
  resourceHints.prefetchDNS.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observer.callback = callback;
        observer.options = options;
      }

      disconnect = observer.disconnect;
      observe = observer.observe;
    },
  );
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("BrowserFrame", () => {
  it.each([
    ["homepage", <HeroDemoIframe key="homepage" src="https://demo.customermates.com/en/dashboard" />],
    ["article", <ProductDemo key="article" path="/contacts" />],
    ["standalone", <ProductDemo key="standalone" path="/contacts" presentation="standalone" />],
    ["docs", <DocsDemo key="docs" src="https://demo.customermates.com/en/dashboard" title="Demo" />],
  ])("discloses an interactive live preview and shares one width cap on %s", (_, component) => {
    const host = mount(component);
    const frame = host.querySelector("[data-live-preview]");
    expect(frame?.classList.contains("max-w-live-preview")).toBe(true);
    expect(frame?.textContent).toContain("BrowserFrame.live");
    expect(frame?.textContent).not.toContain("BrowserFrame.interactive");
    expect(
      Array.from(frame?.querySelectorAll('a[target="_blank"]') ?? []).some((link) =>
        link.textContent?.includes("BrowserFrame.open"),
      ),
    ).toBe(true);
    const urlLink = frame?.querySelector<HTMLAnchorElement>("a[title]");
    expect(urlLink?.getAttribute("href")).toBe(urlLink?.getAttribute("title"));
    expect(urlLink?.getAttribute("target")).toBe("_blank");
    expect(urlLink?.textContent).toBe("demo.customermates.com");
  });

  it("routes product previews locally only during development", () => {
    const src = "https://demo.customermates.com/de/contacts?agentChat=closed";
    vi.stubEnv("BASE_URL", "http://localhost:4015/");
    vi.stubEnv("NODE_ENV", "development");
    expect(localProductDemoSrc(src)).toBe("http://localhost:4015/de/contacts?agentChat=closed");
    expect(localProductDemoSrc("https://example.com/preview")).toBe("https://example.com/preview");
    vi.stubEnv("NODE_ENV", "production");
    expect(localProductDemoSrc(src)).toBe(src);
  });

  it("keeps shared frames lazy until they intersect", () => {
    const host = mount(<ProductDemo path="/dashboard" />);

    expect(observer.options).toBeUndefined();
    expect(host.querySelector("iframe")).toBeNull();
    expect(resourceHints.preconnect).not.toHaveBeenCalled();
    expect(resourceHints.prefetchDNS).not.toHaveBeenCalled();

    setIntersection(false);
    expect(host.querySelector("iframe")).toBeNull();

    setIntersection(true);
    const frame = host.querySelector("iframe");
    expect(frame?.getAttribute("loading")).toBe("lazy");
    expect(frame?.getAttribute("src")).toBe("https://demo.customermates.com/en/dashboard?agentChat=closed");
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("warms the origin and eagerly mounts a load-ahead frame at the observer boundary", () => {
    const host = mount(<HeroDemoIframe src="https://demo.customermates.com/en/dashboard?agentChat=open" />);

    expect(observer.options).toStrictEqual({ rootMargin: "400px 0px" });
    expect(resourceHints.prefetchDNS).toHaveBeenCalledWith("https://demo.customermates.com");
    expect(resourceHints.preconnect).toHaveBeenCalledWith("https://demo.customermates.com");
    expect(host.querySelector("iframe")).toBeNull();

    setIntersection(true);
    expect(host.querySelector("iframe")?.getAttribute("loading")).toBe("eager");
  });
});
