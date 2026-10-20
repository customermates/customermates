import type { DragEndEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { SetupAnswerValue } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupQuestionDescriptor } from "../setup-question-descriptor";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dndSpy = vi.hoisted(() => ({
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
  items: [] as string[],
}));

vi.mock("@dnd-kit/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: DragEndEvent) => void }) => {
    dndSpy.onDragEnd = onDragEnd;
    return children;
  },
}));
vi.mock("@dnd-kit/sortable", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  SortableContext: ({ children, items }: { children: ReactNode; items: string[] }) => {
    dndSpy.items = items;
    return children;
  },
}));
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
    expect(container.querySelector("[aria-pressed]")).toBeNull();
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe(
      "WorkspaceSetup.questions.customerKind.label",
    );

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

  it("shows own entries as selected toggles like the offered options and removes one when deselected", () => {
    render(descriptorOf("leadSources"), { format: "multipleChoice", values: ["website"], custom: ["Podcast"] });

    const custom = button("Podcast");
    const offered = button("WorkspaceSetup.options.leadSources.website");
    expect(custom.getAttribute("role")).toBe("checkbox");
    expect(custom.getAttribute("aria-checked")).toBe("true");
    expect(custom.hasAttribute("aria-pressed")).toBe(false);
    expect(custom.className).toBe(offered.className);
    act(() => custom.click());
    expect(onChange).toHaveBeenLastCalledWith({ format: "multipleChoice", values: ["website"], custom: [] });
  });

  it("edits, drags to reorder and removes ordered list entries with win chances", () => {
    render(descriptorOf("salesSteps"), {
      format: "orderedList",
      items: [
        { label: "Lead", winChance: 10 },
        { label: "Offer", winChance: 60 },
      ],
    });

    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(2);
    const handles = container.querySelectorAll('button[aria-label^="DataView.dragToReorderNamed"]');
    expect(handles).toHaveLength(2);
    expect([...handles].every((handle) => handle.parentElement?.lastElementChild === handle)).toBe(true);
    expect(container.querySelector("ol li")?.textContent).not.toContain("1");
    expect(container.querySelector('button[aria-label^="WorkspaceSetup.interview.move"]')).toBeNull();
    const [lead, offer] = dndSpy.items;
    act(() => dndSpy.onDragEnd?.({ active: { id: offer }, over: { id: lead } } as DragEndEvent));
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

  it("keeps typing a range bound as typed and settles it within the allowed range when the field is left", () => {
    render(descriptorOf("dealSize"), { format: "range", min: 100, max: null }, { currency: "EUR" });

    const [from, to] = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    type(to, "5");
    expect(to.value).toBe("5");
    expect(onChange).toHaveBeenLastCalledWith({ format: "range", min: 100, max: 5 });
    type(to, "500");
    expect(to.value).toBe("500");
    expect(onChange).toHaveBeenLastCalledWith({ format: "range", min: 100, max: 500 });

    type(to, "5");
    act(() => {
      to.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith({ format: "range", min: 100, max: 100 });
    expect(to.value).toBe("100");

    onChange.mockClear();
    type(from, "");
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      from.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(from.value).toBe("100");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("names the range currency with the shared currency label, whatever the stored casing", () => {
    render(descriptorOf("dealSize"), null, { currency: "eur" });

    expect(container.textContent).toContain("Euro (EUR)");
    expect(container.textContent).not.toContain("eur");
  });

  it("lets both range bounds shrink on narrow screens so the currency stays on their row", () => {
    render(descriptorOf("dealSize"), { format: "range", min: 500, max: 5000 }, { currency: "EUR" });

    const [from, to] = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    const bounds = from.parentElement;
    expect(to.parentElement).toBe(bounds);
    expect(bounds?.className.split(" ")).toEqual(expect.arrayContaining(["flex-1", "min-w-48", "sm:flex-none"]));
    for (const input of [from, to])
      expect(input.className.split(" ")).toEqual(expect.arrayContaining(["min-w-0", "flex-1", "sm:w-32"]));
    const unit = [...(bounds?.parentElement?.children ?? [])].find((child) => child.textContent === "Euro (EUR)");
    expect(unit).toBeDefined();

    render(descriptorOf("salesCycle"), { format: "range", min: 30, max: null });
    const [single] = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    expect(single.className.split(" ")).toContain("w-32");
    expect(single.className.split(" ")).not.toContain("flex-1");
  });

  it("renders a long short-text answer as a text area", () => {
    render(descriptorOf("anythingMissed"), null);
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("marks a missing answer like other form fields: red label and invalid control, the message only in the toast", () => {
    render(descriptorOf("companyName"), { format: "shortText", value: "" }, { invalid: true });

    const group = container.querySelector<HTMLElement>('[aria-labelledby="setup-question-companyName"]');
    expect(group?.hasAttribute("aria-describedby")).toBe(false);
    expect(group?.getAttribute("data-invalid")).toBe("true");
    expect(container.querySelector("#setup-question-companyName")?.className).toContain("text-destructive");
    expect(container.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).not.toContain("Common.errors.mustNotBeBlank");

    render(descriptorOf("companyName"), { format: "shortText", value: "Acme" });
    expect(container.querySelector("input")?.hasAttribute("aria-invalid")).toBe(false);
  });

  it.each([
    ["customerKind", '[role="radio"]'],
    ["purpose", '[role="checkbox"]'],
    ["weeklyNumbers", "button[aria-pressed]"],
  ])("marks every unpicked chip of a missing %s answer invalid without an inline message", (id, chip) => {
    render(descriptorOf(id), null, { invalid: true });

    const chips = [...container.querySelectorAll(chip)];
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((element) => element.getAttribute("aria-invalid") === "true")).toBe(true);
    expect(container.textContent).not.toContain("Common.errors.mustNotBeBlank");

    render(descriptorOf(id), null);
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it("marks a required question with the form asterisk", () => {
    render(descriptorOf("language"), null);
    expect(container.querySelector("label .text-destructive")?.textContent).toBe(" *");
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
