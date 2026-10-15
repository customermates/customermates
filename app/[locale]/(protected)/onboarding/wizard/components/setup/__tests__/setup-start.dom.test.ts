import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  start: vi.fn(),
  status: vi.fn(),
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
vi.mock("../../../workspace-setup-actions", () => ({
  startWorkspaceSetupAction: harness.start,
  getWorkspaceSetupStatusAction: harness.status,
}));

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupStart } from "../setup-start";

const FOOTER_CLASSES = ["flex-col-reverse", "border-t", "pt-4", "sm:flex-row", "sm:justify-end"];

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
  const store = new WorkspaceSetupStore({} as never);
  store.hydrate({ available: true, setup: null });
  harness.rootStore = { workspaceSetupStore: store, stepProfileStore: { form: { email: "", websiteUrl: "" } } };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupStart", () => {
  it("ends in the setup footer, with Start the setup first on phones", () => {
    act(() => root.render(createElement(SetupStart)));

    const footer = button("WorkspaceSetup.start.start").parentElement;
    expect(footer?.className.split(" ")).toEqual(expect.arrayContaining(FOOTER_CLASSES));
    expect([...(footer?.children ?? [])].map((child) => child.textContent)).toEqual([
      "WorkspaceSetup.start.withoutWebsite",
      "WorkspaceSetup.start.start",
    ]);
  });

  it("starts without a website from the secondary action", async () => {
    act(() => root.render(createElement(SetupStart)));

    await act(async () => {
      button("WorkspaceSetup.start.withoutWebsite").click();
      await Promise.resolve();
    });
    expect(harness.start).toHaveBeenCalledWith({ websiteUrl: null, locale: expect.any(String) });
  });
});
