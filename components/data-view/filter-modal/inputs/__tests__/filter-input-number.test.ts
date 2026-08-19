import type { Root } from "react-dom/client";
import type { ReactElement } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterSchema } from "@/core/base/base-get.schema";
import {
  formatLocalizedNumber,
  parseLocalizedNumber,
  parseLocalizedNumberToCanonical,
} from "@/core/stores/intl-number";

const harness = vi.hoisted(() => ({
  form: null as { getValue: (id: string) => unknown; onChange: ReturnType<typeof vi.fn>; isDisabled: boolean } | null,
  intl: null as Record<string, unknown> | null,
}));

vi.mock("@/components/forms/form-context", () => ({ useAppForm: () => harness.form }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ intlStore: harness.intl }) }));

import { FilterInputNumber } from "../filter-input-number";

const FIELD = "17000000-0000-4000-8000-000000000001";
const INPUT_ID = "filters[0].value";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function makeIntl(locale: string) {
  return {
    formatNumber: (n: number | undefined) =>
      formatLocalizedNumber(n, locale, {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        useGrouping: true,
      }),
    formatNumberForEditing: (n: number | undefined) =>
      formatLocalizedNumber(n, locale, { maximumFractionDigits: 20, useGrouping: false }),
    parseNumber: vi.fn((value: string) => parseLocalizedNumber(value, locale)),
    parseNumberToCanonical: vi.fn((value: string) => parseLocalizedNumberToCanonical(value, locale)),
  };
}

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);
  act(() => root.render(element));

  return container;
}

function renderInput(locale: string, stored: unknown) {
  const intl = makeIntl(locale);
  harness.intl = intl;
  harness.form = { getValue: () => stored, onChange: vi.fn(), isDisabled: false };

  const container = mount(createElement(FilterInputNumber, { id: INPUT_ID, isValidFilter: true }));
  const input = container.querySelector("input");
  if (!input) throw new Error("filter number input did not render");

  return { input, intl, form: harness.form };
}

function type(input: HTMLInputElement, text: string) {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blur(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(new FocusEvent("blur"));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

function lastCommitted(form: { onChange: ReturnType<typeof vi.fn> }) {
  const calls = form.onChange.mock.calls;
  return calls.length ? calls[calls.length - 1][1] : undefined;
}

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  containers.splice(0).forEach((container) => container.remove());
  vi.clearAllMocks();
});

describe("FilterInputNumber commits a canonical string", () => {
  it.each([
    ["en-US", "1,234.5"],
    ["de-DE", "1.234,5"],
    ["fr-FR", "1 234,5"],
  ])("emits the same locale-independent string for %s entry", (locale, typed) => {
    const { input, form } = renderInput(locale, undefined);

    type(input, typed);

    expect(lastCommitted(form)).toBe("1234.5");
    expect(typeof lastCommitted(form)).toBe("string");
  });

  it("never commits a JavaScript number, which is what the filter schema rejects", () => {
    const { input, form } = renderInput("en-US", undefined);

    type(input, "10");
    blur(input);

    for (const [, committed] of form.onChange.mock.calls) expect(typeof committed).not.toBe("number");
  });

  it("uses the canonical parser rather than the numeric one", () => {
    const { input, intl } = renderInput("en-US", undefined);

    type(input, "42");
    blur(input);

    expect(intl.parseNumberToCanonical).toHaveBeenCalled();
    expect(intl.parseNumber).not.toHaveBeenCalled();
  });

  it.each([
    ["0", "0"],
    ["-50", "-50"],
    ["0.25", "0.25"],
    ["1234.5678", "1234.5678"],
  ])("preserves sign and precision for %s", (typed, expected) => {
    const { input, form } = renderInput("en-US", undefined);

    type(input, typed);

    expect(lastCommitted(form)).toBe(expected);
  });

  it("commits undefined when the field is cleared so the filter is dropped rather than queried", () => {
    const { input, form } = renderInput("en-US", "10");

    type(input, "");

    expect(lastCommitted(form)).toBeUndefined();
  });

  it("commits a canonical string on blur as well as on change", () => {
    const { input, form } = renderInput("en-US", undefined);

    type(input, "1,234.5");
    form.onChange.mockClear();
    blur(input);

    expect(lastCommitted(form)).toBe("1234.5");
  });

  it("renders a stored canonical string as a localized display value", () => {
    const { input } = renderInput("de-DE", "1234.5");

    expect(input.value).toBe("1.234,5");
  });
});

describe("what the input commits is what the filter transport accepts", () => {
  it.each([
    [FilterOperatorKey.equals],
    [FilterOperatorKey.gt],
    [FilterOperatorKey.gte],
    [FilterOperatorKey.lt],
    [FilterOperatorKey.lte],
  ])("round trips through FilterSchema unchanged for %s", (operator) => {
    const { input, form } = renderInput("en-US", undefined);

    type(input, "1,234.5");
    const committed = lastCommitted(form);

    expect(FilterSchema.parse({ field: FIELD, operator, value: committed })).toEqual({
      field: FIELD,
      operator,
      value: "1234.5",
    });
  });

  it("emits a string where the previous implementation emitted a number of the same value", () => {
    const { input, form } = renderInput("en-US", undefined);

    type(input, "1,234.5");
    const committed = lastCommitted(form);
    const previousImplementation = parseLocalizedNumber("1,234.5", "en-US");

    expect(typeof previousImplementation).toBe("number");
    expect(typeof committed).toBe("string");
    expect(Number(committed)).toBe(previousImplementation);
  });
});
