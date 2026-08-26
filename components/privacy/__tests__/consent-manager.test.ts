import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reloadAfterConsentWithdrawal = vi.hoisted(() => vi.fn());

vi.mock("next/dynamic", () => ({
  default: () => () => createElement("span", { "data-analytics-tag": "loaded" }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string) => key;
    translate.rich = (key: string, values: { privacyLink: (children: ReactNode) => ReactNode }) =>
      createElement("span", null, key, values.privacyLink("privacy"));
    return translate;
  },
}));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children }: { children: ReactNode }) => createElement("a", null, children),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => createElement("button", props, children),
}));
vi.mock("@/core/privacy/reload", () => ({ reloadAfterConsentWithdrawal }));

import { ConsentManager } from "../consent-manager";

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing button ${label}`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.cookie = "cm_consent=; Path=/; Max-Age=0";
  reloadAfterConsentWithdrawal.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("ConsentManager optional-tag boundary", () => {
  it("keeps analytics absent before consent and initializes it once after acceptance", () => {
    act(() =>
      root.render(
        createElement(ConsentManager, {
          appMode: "cloud",
          initialConsent: null,
        }),
      ),
    );

    expect(container.querySelectorAll("[data-analytics-tag]")).toHaveLength(0);

    act(() => button("ConsentManager.accept").click());

    expect(container.querySelectorAll("[data-analytics-tag]")).toHaveLength(1);
    expect(decodeURIComponent(document.cookie)).toContain('"analytics":true');
    expect(decodeURIComponent(document.cookie)).toContain('"advertising":false');
  });

  it.each(["demo", "self-hosted"] as const)("never renders managed analytics in %s mode", (appMode) => {
    act(() =>
      root.render(
        createElement(ConsentManager, {
          appMode,
          initialConsent: {
            advertising: false,
            analytics: true,
            decidedAt: "2026-08-26T10:00:00.000Z",
            version: 1,
          },
        }),
      ),
    );

    expect(container.innerHTML).toBe("");
  });

  it("stops analytics and reloads after consent withdrawal", () => {
    act(() =>
      root.render(
        createElement(ConsentManager, {
          appMode: "cloud",
          initialConsent: {
            advertising: false,
            analytics: true,
            decidedAt: "2026-08-26T10:00:00.000Z",
            version: 1,
          },
        }),
      ),
    );

    expect(container.querySelectorAll("[data-analytics-tag]")).toHaveLength(1);
    act(() => button("ConsentManager.manage").click());
    act(() => button("ConsentManager.reject").click());

    expect(container.querySelectorAll("[data-analytics-tag]")).toHaveLength(0);
    expect(reloadAfterConsentWithdrawal).toHaveBeenCalledOnce();
    expect(decodeURIComponent(document.cookie)).toContain('"analytics":false');
  });
});
