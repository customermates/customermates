import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, string | number>) =>
        values ? `${key} ${Object.values(values).join(" ")}` : key,
      { raw: (key: string) => [`${key}.first`, `${key}.second`] },
    ),
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

import { WorkspaceSetupStore } from "../workspace-setup.store";
import { SetupInterview } from "../setup-interview";
import { setupView } from "./setup-view-fixture";

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
const wizard = { isSubmitting: false, completeSetupStep: vi.fn(() => Promise.resolve()) };

function renderDataScreen(existingData: string) {
  const store = new WorkspaceSetupStore({ localeStore: { locale: "en" } } as never);
  store.hydrate({ available: true, setup: setupView() });
  store.setAnswer("existingData", {
    format: "singleChoice",
    value: existingData,
  });
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
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (scrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
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
    expect(upload?.parentElement?.nextElementSibling?.contains(field("purposeDetails"))).toBe(true);
  });

  it("asks for no spreadsheet when the workspace starts with sample data", () => {
    renderDataScreen("sampleData");

    expect(container.querySelector("#setup-spreadsheet")).toBeNull();
    expect(field("existingData").nextElementSibling).toBeNull();
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

  it("keeps the plan button enabled, marks the missing answers and focuses the first when it is pressed too early", async () => {
    renderWebsite(setupView());
    const next = [...container.querySelectorAll("button")].find((candidate) =>
      candidate.textContent?.includes("WorkspaceSetup.interview.showPlan"),
    );
    expect(next?.disabled).toBe(false);
    const bar = next?.closest<HTMLElement>('[data-slot="setup-action-bar"]');
    expect(bar?.className.split(" ")).toEqual(
      expect.arrayContaining(["sticky", "bottom-[calc(0.625rem+var(--safe-bottom))]"]),
    );
    expect(bar?.textContent).toContain("WorkspaceSetup.interview.planHint");
    expect(container.querySelector('[data-invalid="true"]')).toBeNull();

    act(() => next?.click());

    expect(toast).toHaveBeenCalledWith({ errors: ["Common.errors.mustNotBeBlank"] });
    expect(container.querySelector('[data-invalid="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Common.errors.mustNotBeBlank");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement?.closest('[data-invalid="true"]')).not.toBeNull();
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

  it("asks the questions by hand without a website box when the owner chose the questions", () => {
    const text = renderWebsite(
      setupView({ websiteUrl: null, interview: { ...setupView().interview, prefill: "skipped" } }),
    );
    expect(text).not.toContain("WorkspaceSetup.website.title");
    expect(container.querySelector('input[aria-label="Common.inputs.websiteUrl"]')).toBeNull();
    expect(field("workWith")).toBeDefined();
    expect(field("purpose")).toBeDefined();
  });

  it("shows the business name, country, language and currency as one line until the owner changes them", () => {
    const view = setupView({ websiteUrl: null, interview: { ...setupView().interview, prefill: "skipped" } });
    renderWebsite(view);
    const store = (harness.rootStore as { workspaceSetupStore: WorkspaceSetupStore }).workspaceSetupStore;
    act(() => store.setAnswer("companyName", { format: "shortText", value: "Acme" }));
    expect(container.querySelector('[aria-labelledby="setup-question-currency"]')).toBeNull();
    expect(container.textContent).toContain("Acme");

    const change = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === "WorkspaceSetup.website.change",
    );
    act(() => change?.click());
    expect(field("currency")).toBeDefined();
    expect(field("companyName")).toBeDefined();
  });

  it("suggests steps for the tracked work and asks how the owner charges only with customers", () => {
    renderWebsite(setupView({ websiteUrl: null, interview: { ...setupView().interview, prefill: "skipped" } }));
    const store = (harness.rootStore as { workspaceSetupStore: WorkspaceSetupStore }).workspaceSetupStore;
    expect(container.querySelector('[aria-labelledby="setup-question-mainSteps"]')).toBeNull();
    expect(container.querySelector('[aria-labelledby="setup-question-pricing"]')).toBeNull();

    act(() => {
      store.setAnswer("workWith", { format: "singleChoice", value: "clients" });
      store.setAnswer("purpose", { format: "multipleChoice", values: ["deals"], custom: [] });
    });

    expect(field("pricing")).toBeDefined();
    expect(field("mainSteps")).toBeDefined();
    expect([...field("mainSteps").querySelectorAll("input")].map((input) => input.value)).toEqual([
      "WorkspaceSetup.suggestedSteps.dealsClients.first",
      "WorkspaceSetup.suggestedSteps.dealsClients.second",
    ]);
    expect(store.answers.mainSteps).toBeUndefined();
  });
});
