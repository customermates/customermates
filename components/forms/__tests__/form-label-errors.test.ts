import type { ComponentType, ReactElement } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const formErrors = vi.hoisted(() => ({ current: {} as Record<string, string[]> }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (entity: string) => entity }),
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useNavigateToHref: () => vi.fn(),
}));

vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getError: (key: string) => formErrors.current[key],
    getValue: () => undefined,
    isLoading: false,
    isReadOnly: false,
    onChange: vi.fn(),
  }),
}));

import { FormAutocomplete } from "../form-autocomplete";
import { FormCheckbox } from "../form-checkbox";
import { FormInput } from "../form-input";
import { FormInputChips } from "../form-input-chips";
import { FormLabel } from "../form-label";
import { FormRadioGroup } from "../form-radio-group";
import { FormSelect } from "../form-select";
import { FormSelectChip } from "../form-select-chip";
import { FormSwitch } from "../form-switch";
import { FormTextarea } from "../form-textarea";

const render = (component: unknown, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(component as ComponentType<Record<string, unknown>>, props) as ReactElement);

function labelClass(markup: string, text: string): string {
  const match = new RegExp(`<label[^>]*class="([^"]*)"[^>]*>(?:<span>)?${text}`).exec(markup);
  if (!match) throw new Error(`Expected a label for ${text} in ${markup}`);
  return match[1];
}

const FIELDS: Array<{ name: string; markup: () => string }> = [
  { name: "FormInput", markup: () => render(FormInput, { id: "name", inputId: "dom-name", label: "Field" }) },
  { name: "FormTextarea", markup: () => render(FormTextarea, { id: "name", inputId: "dom-name", label: "Field" }) },
  { name: "FormSwitch", markup: () => render(FormSwitch, { id: "name", inputId: "dom-name", label: "Field" }) },
  { name: "FormCheckbox", markup: () => render(FormCheckbox, { id: "name", inputId: "dom-name", label: "Field" }) },
  {
    name: "FormSelect",
    markup: () => render(FormSelect, { id: "name", inputId: "dom-name", label: "Field", items: [] }),
  },
  {
    name: "FormSelectChip",
    markup: () =>
      render(FormSelectChip, { id: "name", inputId: "dom-name", label: "Field", items: [], translateFn: String }),
  },
  {
    name: "FormAutocomplete",
    markup: () =>
      render(FormAutocomplete, {
        id: "name",
        inputId: "dom-name",
        label: "Field",
        items: [],
        children: () => createElement("span"),
        renderValue: () => null,
      }),
  },
  { name: "FormInputChips", markup: () => render(FormInputChips, { id: "name", inputId: "dom-name", label: "Field" }) },
  { name: "FormRadioGroup", markup: () => render(FormRadioGroup, { id: "name", label: "Field", options: [] }) },
];

describe("form field labels", () => {
  it.each(FIELDS)("$name colours its label from the store key, not the DOM id", ({ markup }) => {
    formErrors.current = { name: ["Required"] };
    expect(labelClass(markup(), "Field")).toContain("text-destructive");

    formErrors.current = { "dom-name": ["Required"] };
    expect(labelClass(markup(), "Field")).not.toContain("text-destructive");
  });

  it("keys a standalone label on fieldId while htmlFor names the control", () => {
    formErrors.current = { expiresIn: ["Too short"] };
    const markup = render(FormLabel, { fieldId: "expiresIn", htmlFor: "api-key-expires", children: "Expires" });

    expect(markup).toContain('for="api-key-expires"');
    expect(labelClass(markup, "Expires")).toContain("text-destructive");
  });

  it("falls back to htmlFor when the control id is the store key", () => {
    formErrors.current = { name: ["Required"] };

    expect(labelClass(render(FormLabel, { htmlFor: "name", children: "Name" }), "Name")).toContain("text-destructive");
  });
});
