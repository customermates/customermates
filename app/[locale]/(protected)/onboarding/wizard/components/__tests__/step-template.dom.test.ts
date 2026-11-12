import type { Root } from "react-dom/client";
import type { OnboardingTemplateCard } from "@/features/onboarding-templates/onboarding-template-offer";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => void action(),
  reportApplicationError: vi.fn(),
}));
vi.mock("../../actions", () => ({
  applyOnboardingPlaybookAction: vi.fn(),
  completeOnboardingSetupStepAction: vi.fn(),
  completeOnboardingWizardAction: vi.fn(),
  saveOnboardingWizardProgressAction: vi.fn(),
  selectOnboardingJobAction: vi.fn(),
}));
vi.mock("../../onboarding-agent-actions", () => ({
  getOnboardingAgentStatusAction: vi.fn(),
  getOnboardingTemplatePromptAction: vi.fn(),
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { StepTemplate, StepTemplateFooter, TEMPLATE_INITIAL_LIMIT } from "../step-template";

let container: HTMLDivElement;
let root: Root;
let store: OnboardingWizardStore;

const FAMILIES = ["sales", "clients", "property", "recruiting", "operations", "content", "intake", "community"] as const;

const THREE: OnboardingTemplateCard[] = [
  { slug: "sales-pipeline", family: "sales", name: "Sales pipeline", summary: "Deals to proposals.", counts: { lists: 4, views: 8, rules: 17 } },
  { slug: "client-tracker", family: "clients", name: "Client tracker", summary: "One row per client.", counts: { lists: 3, views: 9, rules: 0 } },
  { slug: "real-estate-pipeline", family: "property", name: "Real estate", summary: "Listings and viewings.", counts: { lists: 7, views: 11, rules: 23 } },
];

function manyCards(count: number): OnboardingTemplateCard[] {
  return Array.from({ length: count }, (_, index) => ({
    slug: THREE[index % 3].slug,
    family: FAMILIES[index % FAMILIES.length],
    name: `Template ${index}`,
    summary: `Summary ${index}`,
    counts: { lists: index + 1, views: 2, rules: index % 2 },
  }));
}

async function setup(cards: OnboardingTemplateCard[], preselection: { slug: string | null; reason: "default" | "signup" | "page" | null }) {
  store = new OnboardingWizardStore({
    stepAiStore: { reset: vi.fn(), restoreSelection: vi.fn() },
    localeStore: { locale: "en" },
  } as never);
  store.initialize(3, "owner-a", undefined, true, { selectedJob: "agent", suggestedJob: null }, {
    chooseAvailable: true,
    templatesAvailable: true,
    template: (preselection.slug ?? null) as never,
  });
  harness.rootStore = { onboardingWizardStore: store };
  await act(async () => {
    root.render(createElement(StepTemplate, { cards, preselection: preselection as never }));
    await Promise.resolve();
  });
}

function radios() {
  return [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
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

describe("StepTemplate", () => {
  it("shows a card per template with the outcome line and the counts, and checks the preselected one", async () => {
    await setup(THREE, { slug: "client-tracker", reason: "signup" });

    expect(radios()).toHaveLength(3);
    const checked = radios().find((radio) => radio.getAttribute("aria-checked") === "true");
    expect(checked?.id).toBe("onboarding-template-client-tracker");
    expect(container.textContent).toContain("Deals to proposals.");
    expect(container.textContent).toContain("OnboardingWizard.template.counts 4 8 17");
    expect(container.textContent).toContain("OnboardingWizard.template.countsNoRules 3 9");
    expect(container.querySelector('label[for="onboarding-template-client-tracker"]')?.textContent).toContain(
      "OnboardingWizard.template.suggested",
    );
  });

  it("marks the default choice as recommended and puts the selected card first", async () => {
    await setup(THREE, { slug: "real-estate-pipeline", reason: "default" });

    expect(radios()[0].id).toBe("onboarding-template-real-estate-pipeline");
    expect(container.querySelector('label[for="onboarding-template-real-estate-pipeline"]')?.textContent).toContain(
      "OnboardingWizard.template.recommended",
    );
  });

  it("selects another template on click", async () => {
    await setup(THREE, { slug: "sales-pipeline", reason: "default" });

    await act(async () => {
      container.querySelector<HTMLButtonElement>("#onboarding-template-client-tracker")?.click();
      await Promise.resolve();
    });

    expect(store.selectedTemplate).toBe("client-tracker");
  });

  it("filters by family and by search and says so when nothing matches", async () => {
    await setup(THREE, { slug: "sales-pipeline", reason: "default" });
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("[aria-pressed]")];
    expect(buttons.map((button) => button.textContent)).toEqual([
      "OnboardingWizard.template.filterAll",
      "OnboardingWizard.template.families.sales",
      "OnboardingWizard.template.families.clients",
      "OnboardingWizard.template.families.property",
    ]);

    await act(async () => {
      buttons[2].click();
      await Promise.resolve();
    });
    expect(radios().map((radio) => radio.id)).toEqual(["onboarding-template-client-tracker"]);
    expect(buttons[2].getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      buttons[0].click();
      await Promise.resolve();
    });
    const search = container.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search?.getAttribute("aria-label")).toBe("OnboardingWizard.template.searchLabel");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(search, "listings");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(radios().map((radio) => radio.id)).toEqual(["onboarding-template-real-estate-pipeline"]);

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(search, "zzz");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    expect(radios()).toHaveLength(0);
    expect(container.textContent).toContain("OnboardingWizard.template.empty");
  });

  it("shows the first six and offers to browse all of a larger library", async () => {
    const cards = manyCards(10);
    await setup(cards, { slug: cards[7].slug, reason: "default" });

    expect(radios()).toHaveLength(TEMPLATE_INITIAL_LIMIT);
    const browse = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("OnboardingWizard.template.browseAll"),
    );
    expect(browse?.textContent).toContain("10");

    await act(async () => {
      browse?.click();
      await Promise.resolve();
    });
    expect(radios()).toHaveLength(10);
    expect(container.textContent).toContain("OnboardingWizard.template.showFewer");
  });

  it("offers no filters for a single template and no browse button for a short list", async () => {
    await setup([THREE[0]], { slug: "sales-pipeline", reason: "default" });

    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(container.querySelector('input[type="search"]')).toBeNull();
  });

  it("explains the choice with its footer: names the selected template and offers Back and no template", async () => {
    await setup(THREE, { slug: "client-tracker", reason: "signup" });
    await act(async () => {
      root.render(createElement(StepTemplateFooter, { cards: THREE }));
      await Promise.resolve();
    });

    expect(container.querySelector("#onboarding-template-continue")?.textContent).toContain(
      "OnboardingWizard.template.use Client tracker",
    );
    expect(container.querySelector("#onboarding-template-none")?.textContent).toContain(
      "OnboardingWizard.template.none",
    );
    expect(container.querySelector("#onboarding-template-back")).not.toBeNull();
  });

  it("disables the primary action without a selected template", async () => {
    await setup(THREE, { slug: null, reason: null });
    await act(async () => {
      root.render(createElement(StepTemplateFooter, { cards: THREE }));
      await Promise.resolve();
    });

    expect(container.querySelector<HTMLButtonElement>("#onboarding-template-continue")?.disabled).toBe(true);
  });
});
