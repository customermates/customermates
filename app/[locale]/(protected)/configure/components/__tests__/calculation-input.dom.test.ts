import { recordInvariant } from "@/features/records/record-invariant";
import { act, createElement, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalculationExpression } from "@/features/records/record-model.schema";
import messages from "@/i18n/locales/en.json";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const state = vi.hoisted(() => ({ disabled: false }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const text = key
      .split(".")
      .reduce<unknown>(
        (current, segment) => (current && typeof current === "object" ? Reflect.get(current, segment) : undefined),
        messages,
      );
    return String(text ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? name));
  },
}));
vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({ isDisabled: state.disabled, getError: () => undefined }),
}));
vi.mock("@/components/forms/form-select", async () => {
  const React = await import("react");
  return {
    FormSelect: ({
      id,
      label,
      items,
      value,
      disabled,
      onValueChange,
    }: {
      id: string;
      label: string;
      items: Array<{ value: string; label: string; disabled?: boolean }>;
      value: string;
      disabled?: boolean;
      onValueChange: (value: string) => void;
    }) =>
      React.createElement(
        "label",
        { htmlFor: id },
        label,
        React.createElement(
          "select",
          {
            id,
            value,
            disabled,
            onChange: (event: { target: { value: string } }) => onValueChange(event.target.value),
          },
          items.map((item) =>
            React.createElement("option", { key: item.value, value: item.value, disabled: item.disabled }, item.label),
          ),
        ),
      ),
  };
});
vi.mock("@/components/forms/form-autocomplete-currency", async () => {
  const React = await import("react");
  return {
    FormAutocompleteCurrency: ({
      id,
      value,
      disabled,
      onValueChange,
    }: {
      id: string;
      value: string;
      disabled: boolean;
      onValueChange: (value: string) => void;
    }) =>
      React.createElement(
        "select",
        { id, value, disabled, onChange: (event: { target: { value: string } }) => onValueChange(event.target.value) },
        ["eur", "usd"].map((value) => React.createElement("option", { key: value, value }, value)),
      ),
  };
});
vi.mock("@/components/forms/form-autocomplete-avatar", () => ({ FormAutocompleteAvatar: () => null }));
vi.mock("@/components/forms/form-iso-date-picker", () => ({ FormIsoDatePicker: () => null }));
vi.mock("@/app/[locale]/(protected)/company/actions", () => ({ getUsersAction: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { CalculationInput } from "../calculation-input";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const model = createCrmPreset(company);
let root: Root;
let container: HTMLElement;
let latest: CalculationExpression;
function Harness({ initial, typeId }: { initial: CalculationExpression; typeId: string }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return createElement(CalculationInput, { model, typeId, value, onChange: setValue, currency: "usd" });
}
function mount(element: ReactElement) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(element));
}
async function choose(domId: string, value: string) {
  const select = document.getElementById(domId) as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.disabled = false;
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
});

describe("calculation editor interactions", () => {
  it("switches an incoming relationship without corrupting its ID or direction", async () => {
    const relation = model.relationships.filter((relation) => relation.targetTypeId === id("deal"))[0];
    mount(
      createElement(Harness, {
        typeId: id("deal"),
        initial: {
          kind: "related",
          relationId: relation.id,
          direction: "incoming",
          reducer: "sum",
          expression: { kind: "literal", value: null },
        },
      }),
    );
    await choose("expression.relationId", `${id("lineItem.deal")}:incoming`);
    expect(latest.kind === "related" && latest.relationId).toBe(id("lineItem.deal"));
    expect(latest.kind === "related" && latest.direction).toBe("incoming");
  });
  it("edits a child in one pane and returns to the result without losing siblings", async () => {
    const weighted = recordInvariant(model.fields.find((field) => field.id === id("deal.weightedValue")));
    const expression = weighted.behavior.kind === "input" ? null : weighted.behavior.expression;
    mount(createElement(Harness, { typeId: id("deal"), initial: recordInvariant(expression) }));
    const input = recordInvariant(
      [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Input 2")),
    );
    await act(async () => {
      input.click();
      await Promise.resolve();
    });
    expect(container.querySelectorAll('[data-calculation-editor="linear"]')).toHaveLength(1);
    expect((document.getElementById("expression.arguments.1.value.value") as HTMLInputElement).value).toBe("100");
    const result = recordInvariant(
      [...container.querySelectorAll("button")].find((button) => button.textContent === "Result"),
    );
    await act(async () => {
      result.click();
      await Promise.resolve();
    });
    expect(latest).toEqual(expression);
    expect(document.getElementById("expression.operator")).toBeTruthy();
  });
  it("supports seeded select literals and generic option attributes", async () => {
    mount(
      createElement(Harness, {
        typeId: id("lineItem"),
        initial: { kind: "literal", value: { kind: "select", value: "saved" } },
      }),
    );
    expect((document.getElementById("expression.literalKind") as HTMLSelectElement).value).toBe("select");
    expect((document.getElementById("expression.value.value") as HTMLSelectElement).selectedOptions[0].text).toContain(
      "Saved price",
    );
    await choose("expression.value.value", "live");
    expect(latest).toEqual({ kind: "literal", value: { kind: "select", value: "live" } });
  });
  it("uses searchable currency selection and preserves exact decimal values", async () => {
    mount(
      createElement(Harness, {
        typeId: id("deal"),
        initial: { kind: "literal", value: { kind: "decimal", value: "100.125", currency: "EUR" } },
      }),
    );
    await choose("expression.value.currency", "usd");
    expect(latest).toEqual({ kind: "literal", value: { kind: "decimal", value: "100.125", currency: "USD" } });
  });
  it("locks all expression controls while an operation is pending", () => {
    state.disabled = true;
    mount(
      createElement(Harness, {
        typeId: id("deal"),
        initial: {
          kind: "operation",
          operator: "concat",
          arguments: [{ kind: "literal", value: { kind: "text", value: "draft" } }],
        },
      }),
    );
    for (const control of container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
      "input,button,select",
    ))
      expect(control.disabled).toBe(true);
    expect(container.textContent).toContain("Add input");
  });
});

describe("calculation literal defaults", () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimeZone;
  });

  it("seeds a currency literal with the field currency", async () => {
    mount(createElement(Harness, { typeId: id("deal"), initial: { kind: "literal", value: null } }));
    await choose("expression.literalKind", "currency");
    expect(latest).toEqual({ kind: "literal", value: { kind: "decimal", value: "0", currency: "USD" } });
  });

  it("seeds a date literal with today's local calendar date rather than the UTC date", async () => {
    process.env.TZ = "Asia/Tokyo";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T20:00:00.000Z"));
    mount(createElement(Harness, { typeId: id("deal"), initial: { kind: "literal", value: null } }));
    await choose("expression.literalKind", "date");
    expect(latest).toEqual({ kind: "literal", value: { kind: "date", value: "2026-03-02" } });
  });
});
