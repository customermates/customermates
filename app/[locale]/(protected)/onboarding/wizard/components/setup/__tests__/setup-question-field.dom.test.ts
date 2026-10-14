import type { Root } from "react-dom/client";
import type { SetupAnswerValue } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupQuestionDescriptor } from "../setup-question-descriptor";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/components/forms/form-autocomplete-country", () => ({
  FormAutocompleteCountry: (props: { value?: string; onValueChange: (value: string) => void }) =>
    createElement("button", {
      "data-autocomplete": "country",
      "data-value": props.value,
      onClick: () => props.onValueChange("at"),
    }),
}));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({
  FormAutocompleteCurrency: (props: { value?: string }) =>
    createElement("span", { "data-autocomplete": "currency", "data-value": props.value }),
}));

import { followUpDescriptor, partDescriptor } from "../setup-question-descriptor";
import { SetupQuestionField } from "../setup-question-field";
import { setupPart } from "@/features/workspace-setup/setup-interview";

let container: HTMLDivElement;
let root: Root;
let onChange: ReturnType<typeof vi.fn<(value: SetupAnswerValue) => void>>;

const t = (key: string) => key;

function descriptorOf(id: string): SetupQuestionDescriptor {
  const part = setupPart(id);
  if (!part) throw new Error(`Unknown part ${id}`);
  return partDescriptor(part, t);
}

function render(descriptor: SetupQuestionDescriptor, value: SetupAnswerValue | null, extra: object = {}) {
  act(() => root.render(createElement(SetupQuestionField, { descriptor, value, onChange, ...extra })));
}

function button(label: string) {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(label) || candidate.getAttribute("aria-label")?.includes(label),
  );
  if (!found) throw new Error(`Button ${label} did not render.`);
  return found;
}

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
function type(input: HTMLInputElement, value: string) {
  act(() => {
    nativeValue?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onChange = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SetupQuestionField", () => {
  it("renders single choice as radio chips and picks one", () => {
    render(descriptorOf("customerKind"), { format: "singleChoice", value: "businesses" });

    const radios = container.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(button("WorkspaceSetup.options.customerKind.businesses").getAttribute("aria-checked")).toBe("true");

    act(() => button("WorkspaceSetup.options.customerKind.both").click());
    expect(onChange).toHaveBeenCalledWith({ format: "singleChoice", value: "both" });
  });

  it("uses the shared country picker and stores upper-case country codes", () => {
    render(descriptorOf("country"), { format: "singleChoice", value: "DE" });

    const picker = container.querySelector<HTMLButtonElement>('[data-autocomplete="country"]');
    expect(picker?.dataset.value).toBe("de");
    act(() => picker?.click());
    expect(onChange).toHaveBeenCalledWith({ format: "singleChoice", value: "AT" });
  });

  it("offers every interface language as chips", () => {
    render(descriptorOf("language"), null);
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
  });

  it("toggles multiple choice chips and adds an own entry", () => {
    render(descriptorOf("leadSources"), { format: "multipleChoice", values: ["website"], custom: [] });

    act(() => button("WorkspaceSetup.options.leadSources.referrals").click());
    expect(onChange).toHaveBeenLastCalledWith({
      format: "multipleChoice",
      values: ["website", "referrals"],
      custom: [],
    });

    act(() => button("WorkspaceSetup.actions.addOwn").click());
    const input = container.querySelector<HTMLInputElement>('input[aria-label="WorkspaceSetup.actions.addOwn"]');
    if (!input) throw new Error("The own entry field did not open.");
    type(input, "Podcast");
    act(() => button("Common.actions.add").click());
    expect(onChange).toHaveBeenLastCalledWith({ format: "multipleChoice", values: ["website"], custom: ["Podcast"] });
  });

  it("edits, reorders and removes ordered list entries with win chances", () => {
    render(descriptorOf("salesSteps"), {
      format: "orderedList",
      items: [
        { label: "Lead", winChance: 10 },
        { label: "Offer", winChance: 60 },
      ],
    });

    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(2);
    act(() =>
      container.querySelectorAll<HTMLButtonElement>('button[aria-label="WorkspaceSetup.interview.moveUp"]')[1].click(),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      format: "orderedList",
      items: [
        { label: "Offer", winChance: 60 },
        { label: "Lead", winChance: 10 },
      ],
    });

    act(() => button("WorkspaceSetup.interview.addEntry").click());
    expect(onChange).toHaveBeenLastCalledWith({
      format: "orderedList",
      items: [{ label: "Lead", winChance: 10 }, { label: "Offer", winChance: 60 }, { label: "" }],
    });

    act(() => container.querySelectorAll<HTMLButtonElement>('button[aria-label="Common.actions.remove"]')[0].click());
    expect(onChange).toHaveBeenLastCalledWith({ format: "orderedList", items: [{ label: "Offer", winChance: 60 }] });
  });

  it("ranks up to three picks in order and locks the rest", () => {
    render(descriptorOf("weeklyNumbers"), {
      format: "rankedPick",
      values: ["forecast", "newLeads", "pipelineValue"],
    });

    expect(button("WorkspaceSetup.options.weeklyNumbers.forecast").textContent).toContain("1");
    expect(button("WorkspaceSetup.options.weeklyNumbers.overdueTasks").disabled).toBe(true);

    act(() => button("WorkspaceSetup.options.weeklyNumbers.newLeads").click());
    expect(onChange).toHaveBeenLastCalledWith({ format: "rankedPick", values: ["forecast", "pipelineValue"] });
  });

  it("reads a range in the workspace currency", () => {
    render(descriptorOf("dealSize"), null, { currency: "EUR" });

    expect(container.textContent).toContain("EUR");
    const [from, to] = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    type(from, "1000");
    expect(onChange).toHaveBeenLastCalledWith({ format: "range", min: 1000, max: null });
    type(to, "5000");
    expect(onChange).toHaveBeenLastCalledWith({ format: "range", min: 1000, max: 5000 });
  });

  it("renders a long short-text answer as a text area", () => {
    render(descriptorOf("anythingMissed"), null);
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.textContent).toContain("WorkspaceSetup.interview.optional");
  });

  it("marks confident website answers", () => {
    render(descriptorOf("companyName"), { format: "shortText", value: "Acme" }, { fromWebsite: true });
    expect(container.textContent).toContain("WorkspaceSetup.actions.fromWebsite");
  });

  it("renders follow-up questions with the same component", () => {
    render(
      followUpDescriptor({
        id: "followUp1",
        label: "Do renewals follow the contract end?",
        format: "singleChoice",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      }),
      null,
    );

    expect(container.textContent).toContain("Do renewals follow the contract end?");
    act(() => button("No").click());
    expect(onChange).toHaveBeenCalledWith({ format: "singleChoice", value: "no" });
  });
});
