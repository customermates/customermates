import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { formatCanonicalDecimal, parseLocalizedNumberToCanonical } from "@/core/stores/intl-number";

const harness = vi.hoisted(() => ({
  form: null as {
    getValue: (id: string) => unknown;
    getError: () => undefined;
    onChange: ReturnType<typeof vi.fn>;
    isLoading: boolean;
    isReadOnly: boolean;
  } | null,
  intl: null as Record<string, unknown> | null,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (value: string) => value }),
}));
vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => harness.form }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ intlStore: harness.intl }) }));

import { FormDecimalInput } from "../form-decimal-input";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function render(locale: string, stored: unknown) {
  harness.intl = {
    formatDecimal: (value: string) => formatCanonicalDecimal(value, locale),
    formatDecimalForEditing: (value: string) => formatCanonicalDecimal(value, locale, { useGrouping: false }),
    parseNumberToCanonical: (value: string) => parseLocalizedNumberToCanonical(value, locale),
  };
  let value = stored;
  const onChange = vi.fn((_id: string, next: unknown) => {
    value = next;
  });
  harness.form = { getValue: () => value, getError: () => undefined, onChange, isLoading: false, isReadOnly: false };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);
  act(() => root.render(createElement(FormDecimalInput, { id: "amount", label: "Amount" })));
  const input = container.querySelector("input");
  if (!input) throw new Error("decimal input did not render");
  return {
    input,
    onChange,
    rerender: () => act(() => root.render(createElement(FormDecimalInput, { id: "amount", label: "Amount" }))),
  };
}

function type(input: HTMLInputElement, text: string) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  containers.splice(0).forEach((container) => container.remove());
  vi.clearAllMocks();
});

describe("FormDecimalInput", () => {
  it.each([
    ["1,5", "1.5"],
    ["1.000,25", "1000.25"],
    ["-0,125", "-0.125"],
  ])("stores German entry %s as the canonical decimal string %s", (typed, canonical) => {
    const { input, onChange } = render("de-DE", undefined);
    type(input, typed);
    expect(onChange).toHaveBeenLastCalledWith("amount", canonical);
    expect(typeof onChange.mock.lastCall?.[1]).toBe("string");
  });

  it("displays a stored canonical decimal with the locale decimal separator and its exact precision", () => {
    expect(render("de-DE", "1234.50").input.value).toBe("1234,50");
    expect(render("en-US", "1234.50").input.value).toBe("1234.50");
    expect(render("de-DE", "12345678901234567890.123456789").input.value).toBe("12345678901234567890,123456789");
  });

  it("keeps the displayed value on focus so a selection made by the user or browser is replaced by typing", () => {
    const { input } = render("en-US", "2000");
    input.focus();
    input.setSelectionRange(0, input.value.length);
    act(() => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(input.value).toBe("2000");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
  });

  it("keeps unparseable text so validation can reject it instead of silently clearing the value", () => {
    const { input, onChange } = render("de-DE", "1");
    type(input, "abc");
    expect(onChange).toHaveBeenLastCalledWith("amount", "abc");
    type(input, "");
    expect(onChange).toHaveBeenLastCalledWith("amount", undefined);
  });
});
