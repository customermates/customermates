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

import { BrowserFrame } from "../browser-frame";
import { DEMO_RECORD_LIST_PATHS, ProductDemo } from "../product-demo";
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
    ["article", <ProductDemo key="article" path={DEMO_RECORD_LIST_PATHS.contacts} />],
    ["standalone", <ProductDemo key="standalone" path={DEMO_RECORD_LIST_PATHS.contacts} presentation="standalone" />],
    ["docs", <DocsDemo key="docs" src="https://demo.customermates.com/en/dashboard" title="Demo" />],
  ])("shows the live app in the shared product window with one width cap on %s", (_, component) => {
    const host = mount(component);
    const frame = host.querySelector("[data-live-preview]");
    expect(frame?.classList.contains("max-w-live-preview")).toBe(true);
    expect(frame?.querySelector("[data-homepage-window]")).not.toBeNull();
    expect(frame?.textContent).not.toContain("BrowserFrame.live");
    expect(frame?.querySelector('a[target="_blank"]')).toBeNull();
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
    const host = mount(
      <BrowserFrame loadAhead src="https://demo.customermates.com/en/dashboard?agentChat=open" title="Demo" />,
    );

    expect(observer.options).toStrictEqual({ rootMargin: "400px 0px" });
    expect(resourceHints.prefetchDNS).toHaveBeenCalledWith("https://demo.customermates.com");
    expect(resourceHints.preconnect).toHaveBeenCalledWith("https://demo.customermates.com");
    expect(host.querySelector("iframe")).toBeNull();

    setIntersection(true);
    expect(host.querySelector("iframe")?.getAttribute("loading")).toBe("eager");
  });
});
