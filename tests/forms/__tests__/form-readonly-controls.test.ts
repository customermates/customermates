// @vitest-environment jsdom

import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CalendarProps = {
  disabled?: boolean;
  onSelect?: (value: unknown) => void;
};

const testContext = vi.hoisted(() => ({
  calendarProps: undefined as CalendarProps | undefined,
  isLoading: false,
  isReadOnly: false,
  onChange: vi.fn(),
  popoverOpen: undefined as boolean | undefined,
  value: undefined as unknown,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      "Common.actions.clear": "Clear",
      "Common.inputs.datePlaceholder": "Select a date",
      "Common.inputs.dateRangePlaceholder": "Select a date range",
    };
    return translations[key] ?? key;
  },
}));

vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getValue: () => testContext.value,
    isDisabled: testContext.isLoading || testContext.isReadOnly,
    isLoading: testContext.isLoading,
    isReadOnly: testContext.isReadOnly,
    onChange: testContext.onChange,
  }),
}));

vi.mock("@/components/forms/use-form-field", () => ({
  useFormFieldErrors: () => ({ hasError: false }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    dateFormatMap: {
      descriptiveLong: (date: Date) => date.toISOString().slice(0, 10),
    },
    dateTimeFormatMap: {
      descriptiveLong: (date: Date) => date.toISOString(),
    },
    use12Hour: false,
  }),
}));

vi.mock("@/hooks/use-media-query", () => ({
  useIsWiderThan: () => true,
}));

vi.mock("@/components/ui/calendar", () => ({
  Calendar: (props: CalendarProps) => {
    testContext.calendarProps = props;
    return null;
  },
}));

vi.mock("@/components/ui/popover", async () => {
  const { Fragment, createElement: createMockElement } = await import("react");

  return {
    Popover: ({ children, open }: { children?: ReactNode; open?: boolean }) => {
      testContext.popoverOpen = open;
      return createMockElement("div", { "data-popover-root": "" }, children);
    },
    PopoverContent: ({ children }: { children?: ReactNode }) =>
      createMockElement("div", { "data-popover-content": "" }, children),
    PopoverTrigger: ({ children }: { children?: ReactNode }) =>
      createMockElement(Fragment, null, children),
  };
});

import { FormCheckbox } from "@/components/forms/form-checkbox";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { FormIsoDateRangePicker } from "@/components/forms/form-iso-date-range-picker";
import { FormRadioGroup } from "@/components/forms/form-radio-group";
import { FormSwitch } from "@/components/forms/form-switch";

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function requiredElement<T extends Element>(element: T | null | undefined): T {
  if (!element) throw new Error("Expected element to exist");
  return element;
}

beforeEach(() => {
  testContext.calendarProps = undefined;
  testContext.isLoading = false;
  testContext.isReadOnly = false;
  testContext.onChange.mockReset();
  testContext.popoverOpen = undefined;
  testContext.value = undefined;
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
});

describe("date form read-only semantics", () => {
  it("keeps the date trigger focusable while closing the popover and suppressing mutations", async () => {
    testContext.isReadOnly = true;
    testContext.value = "2026-08-27";
    const container = mount(
      createElement(FormIsoDatePicker, { id: "startsAt" }),
    );
    const trigger = requiredElement(
      container.querySelector<HTMLButtonElement>("#startsAt"),
    );

    expect(trigger.disabled).toBe(false);
    expect(trigger.dataset.fieldState).toBe("read-only");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.hasAttribute("aria-readonly")).toBe(false);
    expect(trigger.dataset.variant).toBe("field");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    expect(testContext.popoverOpen).toBe(false);
    expect(testContext.calendarProps?.disabled).toBe(false);
    expect(testContext.calendarProps?.onSelect).toBeUndefined();
    expect(container.querySelector('[aria-label="Clear"]')).toBeNull();

    const preset = requiredElement(
      container.querySelector<HTMLButtonElement>('[data-variant="secondary"]'),
    );
    await click(preset);
    expect(testContext.onChange).not.toHaveBeenCalled();
  });

  it("keeps the date-range trigger focusable while closing the popover and suppressing mutations", async () => {
    testContext.isReadOnly = true;
    testContext.value = "2026-08-27,2026-08-28";
    const container = mount(
      createElement(FormIsoDateRangePicker, { id: "window" }),
    );
    const trigger = requiredElement(
      container.querySelector<HTMLButtonElement>("#window"),
    );

    expect(trigger.disabled).toBe(false);
    expect(trigger.dataset.fieldState).toBe("read-only");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.hasAttribute("aria-readonly")).toBe(false);
    expect(trigger.dataset.variant).toBe("field");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    expect(testContext.popoverOpen).toBe(false);
    expect(testContext.calendarProps?.disabled).toBe(false);
    expect(testContext.calendarProps?.onSelect).toBeUndefined();
    expect(container.querySelector('[aria-label="Clear"]')).toBeNull();

    const preset = requiredElement(
      container.querySelector<HTMLButtonElement>('[data-variant="secondary"]'),
    );
    await click(preset);
    expect(testContext.onChange).not.toHaveBeenCalled();
  });

  it("disables date controls only for loading", () => {
    testContext.isLoading = true;
    testContext.isReadOnly = true;
    testContext.value = "2026-08-27";
    const date = mount(createElement(FormIsoDatePicker, { id: "startsAt" }));
    const dateTrigger = requiredElement(
      date.querySelector<HTMLButtonElement>("#startsAt"),
    );

    expect(dateTrigger.disabled).toBe(true);
    expect(dateTrigger.hasAttribute("aria-readonly")).toBe(false);
    expect(dateTrigger.hasAttribute("aria-disabled")).toBe(false);
    expect(dateTrigger.hasAttribute("data-field-state")).toBe(false);
    expect(testContext.popoverOpen).toBe(false);
    expect(testContext.calendarProps?.disabled).toBe(true);
    expect(date.querySelector('[aria-label="Clear"]')).toBeNull();

    testContext.calendarProps = undefined;
    testContext.value = "2026-08-27,2026-08-28";
    const range = mount(
      createElement(FormIsoDateRangePicker, { id: "window" }),
    );
    const rangeTrigger = requiredElement(
      range.querySelector<HTMLButtonElement>("#window"),
    );

    expect(rangeTrigger.disabled).toBe(true);
    expect(rangeTrigger.hasAttribute("aria-readonly")).toBe(false);
    expect(rangeTrigger.hasAttribute("aria-disabled")).toBe(false);
    expect(rangeTrigger.hasAttribute("data-field-state")).toBe(false);
    expect(testContext.popoverOpen).toBe(false);
    expect(
      (testContext.calendarProps as CalendarProps | undefined)?.disabled,
    ).toBe(true);
    expect(range.querySelector('[aria-label="Clear"]')).toBeNull();
  });
});

describe("toggle form read-only semantics", () => {
  it("keeps checkbox and switch controls focusable and suppresses their changes", async () => {
    testContext.isReadOnly = true;
    testContext.value = false;
    const checkboxContainer = mount(
      createElement(FormCheckbox, { id: "accepted" }),
    );
    const checkbox = requiredElement(
      checkboxContainer.querySelector<HTMLButtonElement>("#accepted"),
    );

    expect(checkbox.disabled).toBe(false);
    expect(checkbox.getAttribute("aria-readonly")).toBe("true");
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
    await click(checkbox);
    expect(testContext.onChange).not.toHaveBeenCalled();

    const switchContainer = mount(createElement(FormSwitch, { id: "enabled" }));
    const switchControl = requiredElement(
      switchContainer.querySelector<HTMLButtonElement>("#enabled"),
    );

    expect(switchControl.disabled).toBe(false);
    expect(switchControl.getAttribute("aria-readonly")).toBe("true");
    switchControl.focus();
    expect(document.activeElement).toBe(switchControl);
    await click(switchControl);
    expect(testContext.onChange).not.toHaveBeenCalled();
  });

  it("keeps radio choices focusable, read-only, and explicitly disabled where requested", async () => {
    testContext.isReadOnly = true;
    testContext.value = "alpha";
    const container = mount(
      createElement(FormRadioGroup, {
        id: "choice",
        label: "Choice",
        options: [
          { label: "Alpha", value: "alpha" },
          { label: "Beta", value: "beta" },
          { disabled: true, label: "Gamma", value: "gamma" },
        ],
      }),
    );
    const group = requiredElement(
      container.querySelector<HTMLElement>("#choice"),
    );
    const alpha = requiredElement(
      container.querySelector<HTMLButtonElement>("#choice-alpha"),
    );
    const beta = requiredElement(
      container.querySelector<HTMLButtonElement>("#choice-beta"),
    );
    const gamma = requiredElement(
      container.querySelector<HTMLButtonElement>("#choice-gamma"),
    );

    expect(group.getAttribute("aria-readonly")).toBe("true");
    expect(group.getAttribute("aria-labelledby")).toBe("choice-label");
    expect(container.querySelector("#choice-label")?.textContent).toContain(
      "Choice",
    );
    expect(alpha.disabled).toBe(false);
    expect(beta.disabled).toBe(false);
    expect(gamma.disabled).toBe(true);
    expect(gamma.hasAttribute("data-readonly")).toBe(false);
    expect(alpha.dataset.readonly).toBe("true");
    expect(beta.dataset.readonly).toBe("true");
    expect(alpha.hasAttribute("aria-readonly")).toBe(false);
    expect(beta.hasAttribute("aria-readonly")).toBe(false);
    alpha.focus();
    expect(document.activeElement).toBe(alpha);
    await click(beta);
    expect(testContext.onChange).not.toHaveBeenCalled();
  });

  it("uses native disabled semantics for loading", () => {
    testContext.isLoading = true;
    testContext.isReadOnly = true;
    const checkboxContainer = mount(
      createElement(FormCheckbox, { id: "accepted" }),
    );
    const switchContainer = mount(createElement(FormSwitch, { id: "enabled" }));
    const radioContainer = mount(
      createElement(FormRadioGroup, {
        id: "choice",
        options: [
          { label: "Alpha", value: "alpha" },
          { disabled: true, label: "Beta", value: "beta" },
        ],
      }),
    );

    const checkbox = requiredElement(
      checkboxContainer.querySelector<HTMLButtonElement>("#accepted"),
    );
    const switchControl = requiredElement(
      switchContainer.querySelector<HTMLButtonElement>("#enabled"),
    );
    const group = requiredElement(
      radioContainer.querySelector<HTMLElement>("#choice"),
    );
    const alpha = requiredElement(
      radioContainer.querySelector<HTMLButtonElement>("#choice-alpha"),
    );
    const beta = requiredElement(
      radioContainer.querySelector<HTMLButtonElement>("#choice-beta"),
    );

    expect(checkbox.disabled).toBe(true);
    expect(checkbox.hasAttribute("aria-readonly")).toBe(false);
    expect(switchControl.disabled).toBe(true);
    expect(switchControl.hasAttribute("aria-readonly")).toBe(false);
    expect(group.hasAttribute("aria-readonly")).toBe(false);
    expect(alpha.disabled).toBe(true);
    expect(alpha.hasAttribute("data-readonly")).toBe(false);
    expect(beta.disabled).toBe(true);
    expect(beta.hasAttribute("data-readonly")).toBe(false);
  });
});
