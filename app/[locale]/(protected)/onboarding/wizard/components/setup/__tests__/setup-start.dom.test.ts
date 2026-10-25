import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  start: vi.fn(),
  status: vi.fn(),
  startEmpty: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => undefined }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("../../../workspace-setup-actions", () => ({
  startWorkspaceSetupAction: harness.start,
  getWorkspaceSetupStatusAction: harness.status,
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupStart } from "../setup-start";

let container: HTMLDivElement;
let root: Root;

function button(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!found) throw new Error(`Button ${label} did not render.`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.start.mockResolvedValue({ ok: true, data: { setupId: "x" } });
  harness.status.mockResolvedValue({ ok: true, data: { available: true, setup: null } });
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup: null });
  harness.rootStore = {
    workspaceSetupStore: store,
    onboardingWizardStore: { isSubmitting: false, startEmpty: harness.startEmpty },
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderStart() {
  await act(async () => {
    root.render(createElement(SetupStart));
    await Promise.resolve();
  });
}

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

function typeWebsite(value: string) {
  const input = container.querySelector<HTMLInputElement>("#setup-website");
  if (!input) throw new Error("The website field did not render.");
  act(() => {
    nativeValue?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SetupStart", () => {
  it("waits for the owner to choose how to set up instead of starting by itself", async () => {
    await renderStart();
    expect(harness.start).not.toHaveBeenCalled();
  });

  it("recommends the website first, then the questions, with starting empty as the quietest choice", async () => {
    await renderStart();

    const text = container.textContent ?? "";
    const order = [
      "WorkspaceSetup.start.website.title",
      "WorkspaceSetup.start.questions.title",
      "WorkspaceSetup.empty.action",
    ].map((key) => text.indexOf(key));
    expect(order.every((index, position) => index >= 0 && (position === 0 || index > order[position - 1]))).toBe(true);
    expect(text).toContain("WorkspaceSetup.start.website.recommended");
    expect(button("WorkspaceSetup.start.website.action").disabled).toBe(true);
    expect(button("WorkspaceSetup.start.questions.title").getAttribute("data-variant")).toBe("secondary");
    expect(button("WorkspaceSetup.empty.action").getAttribute("data-variant")).toBe("ghost");
  });

  it("starts with the website the owner entered", async () => {
    await renderStart();
    typeWebsite("example.com");

    await act(async () => {
      button("WorkspaceSetup.start.website.action").click();
      await Promise.resolve();
    });
    expect(harness.start).toHaveBeenLastCalledWith({ websiteUrl: "example.com", locale: expect.any(String) });
  });

  it("starts the questions without a website", async () => {
    await renderStart();

    await act(async () => {
      button("WorkspaceSetup.start.questions.title").click();
      await Promise.resolve();
    });
    expect(harness.start).toHaveBeenLastCalledWith({
      websiteUrl: null,
      locale: expect.any(String),
    });
  });
});
