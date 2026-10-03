import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (entity: string) => entity }),
}));
vi.mock("../form-context", () => ({
  useAppForm: () => ({ getError: () => undefined, getValue: () => "knowledge", onChange: vi.fn() }),
}));

import { FormSelect } from "../form-select";
import { FormFieldHelp } from "../form-field-help";
import { TooltipProvider } from "@/components/ui/tooltip";

const TestFormFieldHelp = FormFieldHelp as ComponentType<
  Omit<ComponentProps<typeof FormFieldHelp>, "children"> & { children?: ReactNode }
>;

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

let container: HTMLDivElement;
let root: Root;
const changed = vi.fn();
const submitted = vi.fn();
const items = [
  { value: "guide", label: "Operating Guide", description: "A guide already exists.", disabled: true },
  { value: "procedure", label: "Procedure", description: "Steps for repeatable tasks." },
  { value: "knowledge", label: "Knowledge", description: "Facts to find when needed." },
];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  changed.mockClear();
  submitted.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  if (scrollIntoViewDescriptor) Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoViewDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

function render(readOnly = false) {
  act(() => {
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(
          "form",
          { onSubmit: submitted },
          createElement(FormSelect, {
            id: "kind",
            label: null,
            ariaLabel: "Page type",
            items,
            readOnly,
            endContent: createElement(TestFormFieldHelp, { label: "About page type" }, "Choose the role of this page."),
            onValueChange: changed,
          }),
        ),
      ),
    );
  });
  return button('[role="combobox"]');
}

function button(selector: string) {
  const element = container.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error(`Missing control: ${selector}`);
  return element;
}

describe("FormSelect inline help", () => {
  it("keeps help inside the field group without nesting buttons, changing the value or submitting", () => {
    const trigger = render();
    const help = button('[aria-label="About page type"]');
    expect(help.closest("[data-form-control-row]")).toBe(trigger.closest("[data-form-control-row]"));
    expect(trigger.contains(help)).toBe(false);
    expect(trigger.textContent).toBe("Knowledge");
    act(() => help.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(changed).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("shows option explanations and the unavailable guide reason without adding them to the selected value", async () => {
    const trigger = render();
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(3);
    expect(options.map((option) => option.textContent)).toEqual([
      "Operating GuideA guide already exists.",
      "ProcedureSteps for repeatable tasks.",
      "KnowledgeFacts to find when needed.",
    ]);
    expect(options[0].getAttribute("aria-disabled")).toBe("true");
    expect(trigger.textContent).toBe("Knowledge");
  });

  it("leaves help available when the select is read-only", () => {
    const trigger = render(true);
    const help = button('[aria-label="About page type"]');
    expect(help.disabled).toBe(false);
    act(() => help.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(changed).not.toHaveBeenCalled();
  });
});
