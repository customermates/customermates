import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
const warning = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning } }));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (_key: string, values: { link: (chunks: ReactNode) => ReactNode }) =>
        createElement("span", null, "Writes are disabled in the demo. ", values.link("Sign in to keep your changes.")),
    }),
}));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));

import { UnexpectedErrorToaster } from "../unexpected-error-toaster";
import { reportApplicationError } from "@/core/errors/report-application-error";

let root: ReactRoot | undefined;
let container: HTMLDivElement | undefined;
const originalLocation = window.location;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, hostname: "demo.customermates.com" },
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("UnexpectedErrorToaster demo warning", () => {
  it("passes the localized warning and sign-in link to Sonner", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(createElement(UnexpectedErrorToaster)));
    await act(async () => {
      reportApplicationError(new Error("blocked demo write"));
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    const html = renderToStaticMarkup(createElement(Fragment, null, warning.mock.calls[0]?.[0]));
    expect(html).toContain("Writes are disabled in the demo");
    expect(html).toContain('href="https://customermates.com/auth/signin"');
    expect(captureException).not.toHaveBeenCalled();
  });

  it("uses outcome-neutral copy for a handled transport interruption", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => root?.render(createElement(UnexpectedErrorToaster)));
    await act(async () => {
      reportApplicationError(new TypeError("Failed to fetch"));
      await Promise.resolve();
    });

    await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
    expect(warning).toHaveBeenCalledWith("ErrorCard.transportInterrupted");
    expect(captureException).not.toHaveBeenCalled();
  });
});
