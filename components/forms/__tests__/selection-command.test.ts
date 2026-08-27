import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  filterItems: [] as Array<{ key: string; value: string; textValue: string }>,
  filterLoadError: false,
  filterLoading: false,
  filterMaxSelectedValues: undefined as number | undefined,
  formIsLoading: false,
  formIsReadOnly: false,
  formValue: undefined as string | string[] | undefined,
  onChange: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { count?: number; value?: string }) => {
    const translations: Record<string, string> = {
      "Common.actions.remove": "Remove",
      "Common.ariaLabels.selectOption": "Select an option",
      "Common.filters.selectionLimit": `Select up to ${values?.count ?? 0}`,
      "Common.filters.unavailableValue": "Filter not available",
      "Common.inputs.addOption": `Add ${values?.value ?? ""}`,
      "Common.inputs.emptyContent": "No results",
      "Common.inputs.unavailableSelection": "Selection unavailable",
      "Common.notifications.unexpectedError": "Something went wrong",
      "Common.table.search": "Search",
      "ErrorCard.retry": "Retry",
    };
    return translations[key] ?? key;
  },
}));

vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => testContext.formValue,
    isDisabled: false,
    isLoading: testContext.formIsLoading,
    isReadOnly: testContext.formIsReadOnly,
    onChange: testContext.onChange,
  }),
}));

vi.mock("@/components/forms/use-form-field", () => ({
  useFormFieldErrors: () => ({ hasError: false }),
  useResolvedFieldLabel: (_id: string, label?: string | null) => label,
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useNavigateToHref: () => vi.fn(),
}));

vi.mock("@/components/entity-terminology/use-filter-field-label", () => ({
  useFilterFieldLabel: () => () => "Contacts",
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    intlStore: {
      formatNumericalShortDate: (date: Date) => date.toISOString(),
    },
  }),
}));

vi.mock("@/components/data-view/filter-modal/inputs/use-filter-select-items", () => ({
  useFilterSelectItems: () => ({
    getItems: undefined,
    isLoading: testContext.filterLoading,
    items: testContext.filterItems,
    loadError: testContext.filterLoadError,
    maxSelectedValues: testContext.filterMaxSelectedValues,
  }),
}));

vi.mock("@/core/utils/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: vi.fn(),
}));

import { FilterInputSelect } from "@/components/data-view/filter-modal/inputs/filter-input-select";
import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";
import { FilterField } from "@/components/data-view/filter-modal/filter-field";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FormAutocomplete } from "../form-autocomplete";
import { FormAutocompleteAvatar } from "../form-autocomplete-avatar";
import { FormAutocompleteCountry } from "../form-autocomplete-country";
import { FormAutocompleteCurrency } from "../form-autocomplete-currency";
import { FormInputChips } from "../form-input-chips";
import { FormSelect } from "../form-select";
import { FormSelectChip } from "../form-select-chip";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

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

async function press(element: Element, key: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
    await Promise.resolve();
  });
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype setter must bypass React's value tracker so cmdk sees the change
const setNativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as
  | ((this: HTMLInputElement, value: string) => void)
  | undefined;

async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    setNativeInputValue?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function option(id: string, name: string) {
  return { id, name };
}

function requiredElement<T extends Element>(element: T | null | undefined): T {
  if (!element) throw new Error("Expected element to exist");
  return element;
}

function TestOption({ children }: { children?: string; textValue: string }) {
  return createElement("span", null, children);
}

function autocomplete(props: Partial<React.ComponentProps<typeof FormAutocomplete<{ id: string; name: string }>>>) {
  const { children = (item) => createElement(TestOption, { textValue: item.name }, item.name), ...rest } = props;
  const componentProps: React.ComponentProps<typeof FormAutocomplete<{ id: string; name: string }>> = {
    children,
    id: "people",
    items: [],
    renderValue: (items) => createElement("span", null, items.map(({ key }) => key).join(", ")),
    ...rest,
  };
  return createElement(FormAutocomplete<{ id: string; name: string }>, componentProps);
}

function filterSelect(maxSelectedValues?: number) {
  testContext.filterMaxSelectedValues = maxSelectedValues;
  return createElement(FilterInputSelect, {
    filter: {
      field: FilterFieldKey.contactIds,
      operator: FilterOperatorKey.in,
      value: Array.isArray(testContext.formValue) ? testContext.formValue : [],
    },
    id: "filters[0].value",
    isValidFilter: true,
  });
}

beforeEach(() => {
  testContext.filterItems = [];
  testContext.filterLoadError = false;
  testContext.filterMaxSelectedValues = undefined;
  testContext.filterLoading = false;
  testContext.formIsLoading = false;
  testContext.formIsReadOnly = false;
  testContext.formValue = undefined;
  testContext.onChange.mockReset();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
});

describe("FormAutocomplete command behavior", () => {
  it("supports listbox navigation, selection, Escape, and focus restoration", async () => {
    const container = mount(
      autocomplete({
        items: [option("alpha", "Alpha"), option("beta", "Beta"), option("gamma", "Gamma")],
      }),
    );
    const trigger = container.querySelector<HTMLButtonElement>("#people");
    expect(trigger).not.toBeNull();

    await click(requiredElement(trigger));
    await flush();

    const input = document.querySelector<HTMLInputElement>("[cmdk-input]");
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    expect(input).not.toBeNull();
    expect(listbox).not.toBeNull();
    expect(document.activeElement).toBe(input);

    await press(requiredElement(input), "ArrowDown");
    expect(document.querySelector('[cmdk-item][aria-selected="true"]')?.textContent).toContain("Beta");

    await press(requiredElement(input), "End");
    expect(document.querySelector('[cmdk-item][aria-selected="true"]')?.textContent).toContain("Gamma");

    await press(requiredElement(input), "Enter");
    await flush();
    expect(testContext.onChange).toHaveBeenLastCalledWith("people", "gamma");
    expect(document.activeElement).toBe(trigger);

    await click(requiredElement(trigger));
    await flush();
    const reopenedInput = document.querySelector<HTMLInputElement>("[cmdk-input]");
    await press(requiredElement(reopenedInput), "End");
    await press(requiredElement(reopenedInput), "Home");
    expect(document.querySelector('[cmdk-item][aria-selected="true"]')?.textContent).toContain("Alpha");
    await press(requiredElement(reopenedInput), "Escape");
    await flush();
    expect(document.querySelector("[cmdk-input]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("masks unresolved values in visible and accessible labels", () => {
    const rawId = "2f519944-45fb-42f8-ad9d-d5c9109e2341";
    const container = mount(
      autocomplete({
        selectionMode: "multiple",
        value: [rawId],
      }),
    );

    expect(container.textContent).toContain("Selection unavailable");
    expect(container.textContent).not.toContain(rawId);
    const accessibleLabels = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"), (element) =>
      element.getAttribute("aria-label"),
    );
    expect(accessibleLabels).toContain("Remove");
    expect(accessibleLabels.some((label) => label?.includes(rawId))).toBe(false);
  });

  it("reports async option failures without offering a create action", async () => {
    const getItems = vi.fn().mockRejectedValue(new Error("offline"));
    const container = mount(
      autocomplete({
        getItems,
        onCreate: vi.fn(),
      }),
    );
    await flush();

    await click(requiredElement(container.querySelector("#people")));
    await flush();

    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Something went wrong");
    expect(document.body.textContent).not.toContain("Add ");
  });

  it("creates the typed option when Enter is pressed and nothing matches", async () => {
    const onCreate = vi.fn().mockResolvedValue({ ok: true, data: { id: "zeta", name: "Zeta" } });
    const container = mount(autocomplete({ items: [option("alpha", "Alpha")], onCreate }));

    await click(requiredElement(container.querySelector("#people")));
    await flush();

    const input = requiredElement(document.querySelector<HTMLInputElement>("[cmdk-input]"));
    await typeInto(input, "Zeta");
    await flush();

    await press(input, "Enter");
    await flush();

    expect(onCreate).toHaveBeenCalledExactlyOnceWith("Zeta");
  });

  it("does not open when disabled", async () => {
    const container = mount(autocomplete({ disabled: true }));
    const trigger = requiredElement(container.querySelector<HTMLButtonElement>("#people"));

    expect(trigger.disabled).toBe(true);
    await click(trigger);
    expect(document.querySelector("[cmdk-input]")).toBeNull();
  });

  it("keeps permission-read-only relation chips actionable outside a nested button", async () => {
    testContext.formIsReadOnly = true;
    const onChipClick = vi.fn();
    const container = mount(
      autocomplete({
        items: [option("alpha", "Alpha")],
        label: "People",
        onChipClick,
        readOnly: false,
        selectionMode: "multiple",
        value: ["alpha"],
      }),
    );
    const field = requiredElement(container.querySelector<HTMLElement>("#people"));

    expect(field.getAttribute("role")).toBe("group");
    expect(field.getAttribute("aria-labelledby")).not.toBeNull();
    expect(field.getAttribute("data-field-state")).toBe("read-only");
    expect(field.getAttribute("tabindex")).toBeNull();
    expect(field.closest("button")).toBeNull();
    expect(field.querySelector("svg")).toBeNull();
    expect(container.querySelector('[aria-label="Remove"]')).toBeNull();

    const relationChip = requiredElement(container.querySelector<HTMLElement>('[role="button"]'));
    relationChip.focus();
    expect(document.activeElement).toBe(relationChip);
    expect(relationChip.className).toContain("focus-visible:ring-[2px]");
    await click(relationChip);
    expect(onChipClick).toHaveBeenCalledExactlyOnceWith("alpha");
    await press(relationChip, " ");
    expect(onChipClick).toHaveBeenCalledTimes(2);
    expect(onChipClick).toHaveBeenLastCalledWith("alpha");
    expect(testContext.onChange).not.toHaveBeenCalled();

    await click(field);
    expect(document.querySelector("[cmdk-input]")).toBeNull();
  });

  it("keeps loading controls truly disabled even when disabled is explicitly false", async () => {
    testContext.formIsLoading = true;
    testContext.formIsReadOnly = true;
    const container = mount(autocomplete({ disabled: false, readOnly: true }));
    const trigger = requiredElement(container.querySelector<HTMLButtonElement>("#people"));

    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute("aria-readonly")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await click(trigger);
    expect(document.querySelector("[cmdk-input]")).toBeNull();
  });
});

describe("selection field state semantics", () => {
  it("keeps contextual help beside the visible FormSelect label", () => {
    testContext.formValue = "plain";
    const container = mount(
      createElement(FormSelect, {
        id: "type-with-help",
        items: [{ label: "Text", value: "plain" }],
        label: "Type",
        labelEndAddon: createElement("button", { "aria-label": "About Type", type: "button" }),
        readOnly: true,
      }),
    );

    const label = requiredElement(container.querySelector<HTMLLabelElement>('label[for="type-with-help"]'));
    const help = requiredElement(container.querySelector<HTMLButtonElement>('[aria-label="About Type"]'));

    expect(label.textContent).toBe("Type");
    expect(label.parentElement).toBe(help.parentElement);
  });

  it("keeps FormSelect permission-read-only and lets explicit disabled win", () => {
    testContext.formIsReadOnly = true;
    testContext.formValue = "active";
    const readOnlyContainer = mount(
      createElement(FormSelect, {
        disabled: false,
        id: "status-read-only",
        items: [{ label: "Active", value: "active" }],
        readOnly: false,
      }),
    );
    const readOnlyTrigger = requiredElement(readOnlyContainer.querySelector<HTMLButtonElement>("#status-read-only"));

    expect(readOnlyTrigger.disabled).toBe(false);
    expect(readOnlyTrigger.getAttribute("aria-readonly")).toBe("true");
    expect(readOnlyTrigger.className).toContain("[&>svg:last-child]:hidden");
    readOnlyTrigger.focus();
    expect(document.activeElement).toBe(readOnlyTrigger);

    const disabledContainer = mount(
      createElement(FormSelect, {
        disabled: true,
        id: "status-disabled",
        items: [{ label: "Active", value: "active" }],
        readOnly: true,
      }),
    );
    const disabledTrigger = requiredElement(disabledContainer.querySelector<HTMLButtonElement>("#status-disabled"));

    expect(disabledTrigger.disabled).toBe(true);
    expect(disabledTrigger.getAttribute("aria-readonly")).toBeNull();
  });

  it("applies the same read-only contract to FormSelectChip", () => {
    testContext.formValue = "active";
    const container = mount(
      createElement(FormSelectChip, {
        id: "chip-status",
        items: [{ key: "active" }],
        readOnly: true,
        translateFn: (key) => key,
      }),
    );
    const trigger = requiredElement(container.querySelector<HTMLButtonElement>("#chip-status"));

    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute("aria-readonly")).toBe("true");
    expect(trigger.className).toContain("[&>svg:last-child]:hidden");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });

  it("renders interactive read-only chip inputs as labelled recessed groups without a nested wrapper tab stop", async () => {
    testContext.formIsReadOnly = true;
    testContext.formValue = "alpha,beta";
    const onChipClick = vi.fn();
    const container = mount(
      createElement(
        "div",
        null,
        createElement("span", { id: "external-tags-label" }, "Tags"),
        createElement(FormInputChips, {
          ariaLabelledBy: "external-tags-label",
          id: "tags-read-only",
          label: null,
          onChipClick,
          readOnly: false,
        }),
      ),
    );
    const field = requiredElement(container.querySelector<HTMLElement>('[role="group"]'));

    expect(field.id).toBe("tags-read-only");
    expect(field.getAttribute("tabindex")).toBeNull();
    expect(field.getAttribute("aria-labelledby")).toBe("external-tags-label");
    expect(field.getAttribute("aria-readonly")).toBeNull();
    expect(field.getAttribute("aria-disabled")).toBeNull();
    expect(field.className).toContain("border-border");
    expect(field.className).toContain("bg-background");
    expect(field.className).toContain("text-foreground");
    expect(field.className).toContain("shadow-none");
    expect(field.className).not.toContain("opacity-50");
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector('[aria-label="Remove"]')).toBeNull();

    const chipActions = container.querySelectorAll<HTMLElement>('[role="button"]');
    expect(chipActions).toHaveLength(2);
    chipActions[0]?.focus();
    expect(document.activeElement).toBe(chipActions[0]);
    expect(chipActions[0]?.className).toContain("focus-visible:ring-[2px]");
    await click(chipActions[0]);
    expect(onChipClick).toHaveBeenCalledExactlyOnceWith("alpha");
    await press(chipActions[0], " ");
    expect(onChipClick).toHaveBeenCalledTimes(2);
    expect(onChipClick).toHaveBeenLastCalledWith("alpha");
    expect(testContext.onChange).not.toHaveBeenCalled();
  });

  it("renders explicitly disabled chip inputs as muted native-disabled fields", () => {
    testContext.formIsReadOnly = true;
    testContext.formValue = "alpha";
    const container = mount(
      createElement(FormInputChips, {
        disabled: true,
        id: "tags-disabled",
        onChipClick: vi.fn(),
        readOnly: true,
      }),
    );
    const input = requiredElement(container.querySelector<HTMLInputElement>("#tags-disabled"));
    const field = requiredElement(input.parentElement);

    expect(input.disabled).toBe(true);
    expect(field.getAttribute("aria-disabled")).toBe("true");
    expect(field.getAttribute("aria-readonly")).toBeNull();
    expect(field.className).toContain("cursor-not-allowed");
    expect(field.className).toContain("border-border");
    expect(field.className).toContain("bg-background");
    expect(field.className).toContain("text-muted-foreground");
    expect(field.className).toContain("shadow-none");
    expect(field.className).not.toContain("opacity-50");
    expect(container.querySelector('[aria-label="Remove"]')).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
  });
});

describe("representative FormAutocomplete consumers", () => {
  it("renders resolved country and currency selections", () => {
    const country = mount(createElement(FormAutocompleteCountry, { id: "country", value: "de" }));
    const currency = mount(createElement(FormAutocompleteCurrency, { id: "currency", value: "eur" }));

    expect(country.textContent).toContain("Germany");
    expect(currency.textContent).toContain("EUR");
  });

  it("masks a stale relation value through the avatar wrapper", () => {
    const rawId = "e2978a7b-25dc-4491-9ea7-789e572f96cd";
    const container = mount(
      createElement(FormAutocompleteAvatar, {
        id: "users",
        items: [],
        selectionMode: "multiple",
        value: [rawId],
      }),
    );

    expect(container.textContent).toContain("Selection unavailable");
    expect(container.textContent).not.toContain(rawId);
    const accessibleLabels = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"), (element) =>
      element.getAttribute("aria-label"),
    );
    expect(accessibleLabels.some((label) => label?.includes(rawId))).toBe(false);
  });
});

describe("FilterInputSelect command behavior", () => {
  it.each([FilterOperatorKey.hasSome, FilterOperatorKey.hasNone] as const)(
    "does not render a value control for the value-less %s operator",
    (operator) => {
      const container = mount(
        createElement(FilterField, {
          baseId: "filters[0]",
          customColumns: undefined,
          filter: {
            field: FilterFieldKey.contactIds,
            operator,
          },
          filterableFields: [
            {
              field: FilterFieldKey.contactIds,
              operators: [
                FilterOperatorKey.in,
                FilterOperatorKey.notIn,
                FilterOperatorKey.hasSome,
                FilterOperatorKey.hasNone,
              ],
            },
          ],
        }),
      );

      expect(container.querySelector('[id="filters\\[0\\]\\.value"]')).toBeNull();
    },
  );

  it("never renders unresolved entity IDs when no option loader exists", () => {
    const rawId = "8b2ce431-63b2-4671-8954-cdd93d05fe6d";
    const container = mount(
      createElement(FilterChipValue, {
        customColumns: undefined,
        filter: {
          field: FilterFieldKey.contactIds,
          operator: FilterOperatorKey.in,
          value: [rawId],
        },
        label: "Contact",
        operator: "in",
      }),
    );

    expect(container.textContent).toContain("Filter not available");
    expect(container.textContent).not.toContain(rawId);
    expect(container.innerHTML).not.toContain(rawId);
  });

  it("masks unresolved entity IDs in visible and accessible labels", () => {
    const rawId = "34ba55dd-d96d-4ef6-a027-c01085bb92e1";
    testContext.formValue = [rawId];
    const container = mount(filterSelect());

    expect(container.textContent).toContain("Selection unavailable");
    expect(container.textContent).not.toContain(rawId);
    const accessibleLabels = Array.from(container.querySelectorAll<HTMLElement>("[aria-label]"), (element) =>
      element.getAttribute("aria-label"),
    );
    expect(accessibleLabels).toContain("Remove Selection unavailable");
    expect(accessibleLabels.some((label) => label?.includes(rawId))).toBe(false);
  });

  it("keeps selected values removable when the selection limit is reached", async () => {
    testContext.formValue = ["alpha"];
    testContext.filterItems = [
      { key: "alpha", value: "alpha", textValue: "Alpha" },
      { key: "beta", value: "beta", textValue: "Beta" },
    ];
    const container = mount(filterSelect(1));

    await click(requiredElement(container.querySelector("#filters\\[0\\]\\.value")));
    await flush();

    const items = Array.from(document.querySelectorAll<HTMLElement>("[cmdk-item]"));
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("aria-disabled")).toBe("false");
    expect(items[1]?.getAttribute("aria-disabled")).toBe("true");

    await click(requiredElement(items[0]));
    expect(testContext.onChange).toHaveBeenCalledWith("filters[0].value", undefined);
  });

  it("selects the active filtered option from the keyboard", async () => {
    testContext.filterItems = [
      { key: "alpha", value: "alpha", textValue: "Alpha" },
      { key: "beta", value: "beta", textValue: "Beta" },
    ];
    const container = mount(filterSelect(1));

    await click(requiredElement(container.querySelector("#filters\\[0\\]\\.value")));
    await flush();
    const input = document.querySelector<HTMLInputElement>("[cmdk-input]");

    await press(requiredElement(input), "End");
    await press(requiredElement(input), "Enter");
    expect(testContext.onChange).toHaveBeenCalledWith("filters[0].value", ["beta"]);
  });
});
