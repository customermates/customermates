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
});

describe("BrowserFrame", () => {
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
