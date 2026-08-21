import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { RootStore } from "../root.store";

import { act, createElement, Suspense, use } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Locale } from "@/generated/prisma";

import { IntlStore } from "../intl.store";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));

vi.mock("../root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

import { useHydratedIntlStore } from "../use-hydrated-intl-store";

const mountedRoots: ReactRoot[] = [];
const mountedContainers: HTMLElement[] = [];
const date = new Date("2025-09-09T15:00:00.000Z");

let delayHydration = false;
let releaseHydration: (() => void) | null = null;
let hydrationDelay: Promise<void> | null = null;

function DelayedBoundary({ children }: { children: ReactNode }) {
  if (delayHydration && hydrationDelay) use(hydrationDelay);
  return children;
}

function ZonedText() {
  const intlStore = useHydratedIntlStore();
  return createElement(
    "div",
    null,
    createElement("span", { "data-zoned-value": true }, intlStore.formatNumericalShortDateTime(date)),
    createElement("span", { "data-number-value": true }, intlStore.formatNumber(1234.5)),
  );
}

function TestApp() {
  return createElement(
    Suspense,
    { fallback: createElement("span", { "data-fallback": true }) },
    createElement(DelayedBoundary, null, createElement(ZonedText)),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  delayHydration = false;
  releaseHydration = null;
  hydrationDelay = null;

  const rootStore = {
    companyStore: { company: null },
    localeStore: { locale: "de" },
    userStore: { user: { formattingLocale: Locale.system } },
  } as unknown as RootStore;
  Object.assign(rootStore, { intlStore: new IntlStore(rootStore) });
  testContext.rootStore = rootStore;
});

afterEach(() => {
  act(() => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const container of mountedContainers.splice(0)) container.remove();
  testContext.rootStore = null;
});

describe("useHydratedIntlStore", () => {
  it("keeps a delayed boundary's first client render equal to its server text", async () => {
    const rootStore = testContext.rootStore;
    if (!rootStore) throw new Error("Expected a root store");

    const html = renderToString(createElement(TestApp));
    expect(html).toContain('data-zoned-value="true"');
    expect(html).not.toContain("2025");
    expect(html).toContain("1.234,5");

    rootStore.intlStore.markClientHydrated();
    hydrationDelay = new Promise<void>((resolve) => {
      releaseHydration = resolve;
    });
    delayHydration = true;

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    mountedContainers.push(container);

    const recoverableErrors: unknown[] = [];
    let root: ReactRoot | undefined;
    await act(async () => {
      root = hydrateRoot(container, createElement(TestApp), {
        onRecoverableError: (error) => recoverableErrors.push(error),
      });
      await Promise.resolve();
    });
    if (!root) throw new Error("Expected hydration to create a React root");
    mountedRoots.push(root);

    expect(container.querySelector("[data-zoned-value]")?.textContent).toBe("");
    expect(container.querySelector("[data-number-value]")?.textContent).toBe("1.234,5");

    await act(async () => {
      delayHydration = false;
      releaseHydration?.();
      await hydrationDelay;
    });

    await vi.waitFor(() => {
      expect(container.querySelector("[data-zoned-value]")?.textContent).not.toBe("");
    });
    expect(container.querySelector("[data-number-value]")?.textContent).toBe("1.234,5");
    expect(recoverableErrors).toEqual([]);
  });
});
