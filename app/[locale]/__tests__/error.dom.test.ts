import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ captureError: vi.fn(), notifyWorkspaceChanged: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/errors/report-application-error", () => ({ notifyWorkspaceChanged: harness.notifyWorkspaceChanged }));
vi.mock("@/core/errors/client-reporter", () => ({ captureError: harness.captureError }));
vi.mock("@/components/shared/error-page-view", () => ({
  ErrorPageView: ({ subtitle, body }: { subtitle: string; body: string }) =>
    createElement("main", null, subtitle, body),
}));

import { WORKSPACE_CHANGED_DIGEST } from "@/core/errors/workspace-changed";

import ErrorPage from "../error";

const REDACTED_MESSAGE =
  "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.";

let container: HTMLDivElement;
let root: Root;

function render(digest: string) {
  const error = Object.assign(new Error(REDACTED_MESSAGE), { digest });
  act(() => root.render(createElement(ErrorPage, { error, reset: vi.fn() })));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ErrorPage", () => {
  it("leaves a stale workspace to the reload dialog instead of claiming an error was reported", () => {
    render(WORKSPACE_CHANGED_DIGEST);

    expect(harness.notifyWorkspaceChanged).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("");
    expect(harness.captureError).not.toHaveBeenCalled();
  });

  it("keeps the error page for every other failed render", () => {
    render("301885173");

    expect(harness.notifyWorkspaceChanged).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ErrorCard.subtitle");
    expect(container.textContent).toContain("ErrorCard.contactSupport");
  });
});
