import { act, createElement, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordScalar } from "@/features/records/record-model.schema";
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
vi.mock("@/app/[locale]/(protected)/settings/(workspace)/actions", () => ({ getUsersAction: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { CalculationLiteralInput } from "../calculation-literal-input";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const model = createCrmPreset(company);
let root: Root;
let container: HTMLElement;
let latest: RecordScalar | null;
function Harness({ initial, typeId }: { initial: RecordScalar | null; typeId: string }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return createElement(CalculationLiteralInput, {
    model,
    typeId,
    value,
    onChange: setValue,
    currency: "usd",
    id: "value",
  });
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

describe("calculation fixed value", () => {
  it("supports seeded select values", async () => {
    mount(createElement(Harness, { typeId: id("lineItem"), initial: { kind: "select", value: "saved" } }));
    expect((document.getElementById("value.literalKind") as HTMLSelectElement).value).toBe("select");
    expect((document.getElementById("value.value.value") as HTMLSelectElement).selectedOptions[0].text).toContain(
      "Saved price",
    );
    await choose("value.value.value", "live");
    expect(latest).toEqual({ kind: "select", value: "live" });
  });
  it("uses searchable currency selection and preserves exact decimal values", async () => {
    mount(
      createElement(Harness, { typeId: id("deal"), initial: { kind: "decimal", value: "100.125", currency: "EUR" } }),
    );
    await choose("value.value.currency", "usd");
    expect(latest).toEqual({ kind: "decimal", value: "100.125", currency: "USD" });
  });
  it("locks every control while the form is disabled", () => {
    state.disabled = true;
    mount(createElement(Harness, { typeId: id("deal"), initial: { kind: "text", value: "draft" } }));
    for (const control of container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select"))
      expect(control.disabled).toBe(true);
  });
});

describe("calculation fixed value defaults", () => {
  const originalTimeZone = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimeZone;
  });

  it("seeds a currency literal with the field currency", async () => {
    mount(createElement(Harness, { typeId: id("deal"), initial: { kind: "text", value: "" } }));
    await choose("value.literalKind", "currency");
    expect(latest).toEqual({ kind: "decimal", value: "0", currency: "USD" });
  });

  it("seeds a date literal with today's local calendar date rather than the UTC date", async () => {
    process.env.TZ = "Asia/Tokyo";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T20:00:00.000Z"));
    mount(createElement(Harness, { typeId: id("deal"), initial: { kind: "text", value: "" } }));
    await choose("value.literalKind", "date");
    expect(latest).toEqual({ kind: "date", value: "2026-03-02" });
  });
});
