import type { AnchorHTMLAttributes, ReactNode } from "react";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/locales/en.json";

const state = vi.hoisted(() => ({ segments: ["operator", "users"] }));

vi.mock("next/navigation", () => ({ useSelectedLayoutSegments: () => state.segments }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({
    children,
    href,
    prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) =>
    jsx("a", {
      ...props,
      "data-prefetch": String(prefetch),
      href,
      children,
    }),
}));

import { OperatorNavigation } from "../operator-navigation";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.segments = ["operator", "users"];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("OperatorNavigation", () => {
  it("makes Users primary while preserving a localized Hosted AI destination without prefetch", () => {
    act(() => {
      root.render(
        jsx(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: jsx(OperatorNavigation, {}),
        }),
      );
    });

    const users = container.querySelector<HTMLAnchorElement>('a[href="/operator/users"]');
    const hostedAi = container.querySelector<HTMLAnchorElement>('a[href="/operator/hosted-ai"]');
    const navigation = container.querySelector('nav[aria-label="Operator navigation"]');

    expect(navigation).not.toBeNull();
    expect(navigation?.className).toContain("shrink-0");
    expect(navigation?.firstElementChild?.getAttribute("data-variant")).toBe("line");
    expect(navigation?.querySelector('[role="tab"]')).toBeNull();
    expect(navigation?.querySelector('[role="tablist"]')).toBeNull();
    expect(users?.textContent).toContain("Users");
    expect(users?.getAttribute("aria-current")).toBe("page");
    expect(users?.dataset.prefetch).toBe("false");
    expect(hostedAi?.textContent).toContain("Hosted AI");
    expect(hostedAi?.hasAttribute("aria-current")).toBe(false);
    expect(hostedAi?.dataset.prefetch).toBe("false");
  });

  it("marks Hosted AI as the current operator section", () => {
    state.segments = ["operator", "hosted-ai"];

    act(() => {
      root.render(
        jsx(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: jsx(OperatorNavigation, {}),
        }),
      );
    });

    expect(container.querySelector('a[href="/operator/users"]')?.hasAttribute("aria-current")).toBe(false);
    expect(container.querySelector('a[href="/operator/hosted-ai"]')?.getAttribute("aria-current")).toBe("page");
  });
});
