import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
  useLocale: () => "en",
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
  Tooltip: ({ children }: { children: unknown }) => children,
  TooltipTrigger: ({ children }: { children: unknown }) => children,
  TooltipContent: () => null,
}));
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => undefined }));
vi.mock("@/components/forms/form-autocomplete-country", () => ({ FormAutocompleteCountry: () => null }));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({ FormAutocompleteCurrency: () => null }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../../workspace-setup-actions", () => ({}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: toast }));

import { SETUP_SCREENS } from "@/features/workspace-setup/setup-interview";

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupInterview } from "../setup-interview";
import { setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;
const wizard = { isSubmitting: false, completeSetupStep: vi.fn(() => Promise.resolve()) };

function renderDataScreen(existingData: string) {
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup: setupView() });
  runInAction(() => {
    store.screenIndex = SETUP_SCREENS.indexOf("data");
  });
  store.setAnswer("existingData", { format: "singleChoice", value: existingData });
  harness.rootStore = { workspaceSetupStore: store, onboardingWizardStore: wizard };
  act(() => root.render(createElement(SetupInterview)));
}

function field(id: string) {
  const found = container.querySelector<HTMLElement>(`[aria-labelledby="setup-question-${id}"]`);
  if (!found) throw new Error(`Field ${id} did not render.`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderWebsite(view: ReturnType<typeof setupView>) {
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup: view });
  harness.rootStore = { workspaceSetupStore: store, onboardingWizardStore: wizard };
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(createElement(SetupInterview)));
  return container.textContent ?? "";
}

describe("SetupInterview", () => {
  it("puts the spreadsheet upload right under the choice that asks for it", () => {
    renderDataScreen("spreadsheet");

    const upload = field("existingData").nextElementSibling;
    expect(upload?.querySelector("#setup-spreadsheet")).not.toBeNull();
    expect(upload?.nextElementSibling).toBe(field("anythingMissed"));
  });

  it("asks for no spreadsheet when the workspace starts with sample data", () => {
    renderDataScreen("sampleData");

    expect(container.querySelector("#setup-spreadsheet")).toBeNull();
    expect(field("existingData").nextElementSibling).toBe(field("anythingMissed"));
  });

  it("shows how far the website has been read until its suggestions are in", () => {
    const idle = { interview: { ...setupView().interview, prefill: "idle" as const } };
    const finding = renderWebsite(setupView(idle));
    expect(finding).toContain("WorkspaceSetup.website.finding example.com");
    expect(finding).toContain("WorkspaceSetup.website.eta");

    const knowledgeBase = { ...setupView().knowledgeBase, crawlStatus: "fetching", sourcesFound: 20, sourcesRead: 5 };
    const reading = renderWebsite(setupView({ ...idle, knowledgeBase }));
    expect(reading).toContain("WorkspaceSetup.website.reading example.com 5 20");
    expect(
      container.querySelector('[role="progressbar"][aria-label="example.com"]')?.getAttribute("aria-valuenow"),
    ).toBe("28");

    const done = renderWebsite(setupView());
    expect(done).toContain("WorkspaceSetup.website.suggestedHint");
    expect(done).not.toContain("WorkspaceSetup.website.eta");
  });

  it("keeps only the website status in the live region", () => {
    const idle = { interview: { ...setupView().interview, prefill: "idle" as const } };
    renderWebsite(setupView(idle));

    const live = container.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe("WorkspaceSetup.website.finding example.com 0 0");
  });

  it("cancels changing the website from Close or Escape", () => {
    const changeButton = () =>
      [...container.querySelectorAll("button")].find((candidate) =>
        candidate.textContent?.includes("WorkspaceSetup.website.change"),
      );
    renderWebsite(setupView());

    act(() => changeButton()?.click());
    const cancel = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === "Common.actions.close",
    );
    expect(cancel).toBeDefined();
    act(() => cancel?.click());
    expect(changeButton()).toBeDefined();

    act(() => changeButton()?.click());
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Common.inputs.websiteUrl"]');
    act(() => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(changeButton()).toBeDefined();
    expect(container.querySelector('input[aria-label="Common.inputs.websiteUrl"]')).toBeNull();
  });

  it("keeps Next enabled and marks the missing answers when it is pressed too early", () => {
    renderWebsite(setupView());
    const next = [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("OnboardingWizard.next"),
    );
    expect(next?.disabled).toBe(false);
    expect(container.querySelector('[data-invalid="true"]')).toBeNull();

    act(() => next?.click());

    expect(toast).toHaveBeenCalledWith({ errors: ["Common.errors.mustNotBeBlank"] });
    expect(container.querySelector('[data-invalid="true"]')).not.toBeNull();
    expect(container.textContent).toContain("Common.errors.mustNotBeBlank");
  });

  it("starts an empty workspace only after the owner confirms what they skip", () => {
    renderWebsite(setupView());
    const skip = [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("WorkspaceSetup.empty.action"),
    );
    expect(skip).toBeDefined();

    act(() => skip?.click());
    expect(document.body.textContent).toContain("WorkspaceSetup.empty.description");
    expect(wizard.completeSetupStep).not.toHaveBeenCalled();
    const confirm = [...document.body.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("WorkspaceSetup.empty.confirm"),
    );
    act(() => confirm?.click());
    expect(wizard.completeSetupStep).toHaveBeenCalledOnce();
  });

  it("offers to fill in the answers from a website on every part when none is given", () => {
    const text = renderWebsite(
      setupView({ websiteUrl: null, interview: { ...setupView().interview, prefill: "skipped" } }),
    );
    expect(text).toContain("WorkspaceSetup.website.title");
    expect(text).toContain("WorkspaceSetup.website.hint");
    expect(text).toContain("WorkspaceSetup.website.read");
    const callout = container.querySelector('[data-slot="alert"]');
    expect(callout?.querySelector('input[aria-label="Common.inputs.websiteUrl"]')).not.toBeNull();
    expect(callout?.querySelector('[data-slot="button"][data-variant="secondary"]')?.textContent).toBe(
      "WorkspaceSetup.website.read",
    );
  });
});
