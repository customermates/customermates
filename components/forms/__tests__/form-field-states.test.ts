import type { ComponentType, ReactElement } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ errors: {} as Record<string, string[]>, isReadOnly: false }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getError: (key: string) => form.errors[key],
    getValue: (key: string) => (key === "permission" ? true : key === "readAccess" ? "all" : undefined),
    isLoading: false,
    isReadOnly: form.isReadOnly,
    onChange: vi.fn(),
  }),
}));

import { FormCheckbox } from "../form-checkbox";
import { FormInput } from "../form-input";
import { FormRadioGroup } from "../form-radio-group";
import { FormSelect } from "../form-select";

const render = (component: unknown, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(component as ComponentType<Record<string, unknown>>, props) as ReactElement);

const CONTROLS = [
  {
    name: "FormInput",
    markup: (props: Record<string, unknown>) =>
      render(FormInput, {
        id: "label",
        inputId: "side-label",
        label: "Label",
        description: "Shown on deals",
        ...props,
      }),
    control: /<input[^>]*>/,
  },
  {
    name: "FormSelect",
    markup: (props: Record<string, unknown>) =>
      render(FormSelect, {
        id: "label",
        inputId: "side-label",
        label: "Label",
        description: "Shown on deals",
        items: [],
        ...props,
      }),
    control: /<button[^>]*role="combobox"[^>]*>/,
  },
];

beforeEach(() => {
  form.errors = {};
  form.isReadOnly = false;
});

describe("inline field error messages", () => {
  it.each(CONTROLS)("$name shows the field's message in place of its description when asked", ({ markup, control }) => {
    form.errors = { label: ["Enter a label."] };
    const html = markup({ showErrorMessage: true });

    expect(html).toContain('<p class="text-xs text-destructive" id="side-label-error" role="alert">Enter a label.</p>');
    expect(html).not.toContain("Shown on deals");
    expect(control.exec(html)?.[0]).toContain('aria-describedby="side-label-error"');
    expect(control.exec(html)?.[0]).toContain('aria-invalid="true"');
  });

  it.each(CONTROLS)("$name keeps errors out of the text unless asked", ({ markup, control }) => {
    form.errors = { label: ["Enter a label."] };
    const html = markup({});

    expect(html).not.toContain("Enter a label.");
    expect(control.exec(html)?.[0]).not.toContain("aria-describedby");
    expect(control.exec(html)?.[0]).toContain('aria-invalid="true"');
  });

  it.each(CONTROLS)("$name shows its description while the field is valid", ({ markup }) => {
    const html = markup({ showErrorMessage: true });

    expect(html).toContain("Shown on deals");
    expect(html).not.toContain('role="alert"');
  });
});

describe("locked choice controls", () => {
  it("disables a locked checkbox instead of marking it read-only", () => {
    form.isReadOnly = true;
    const locked = render(FormCheckbox, { id: "permission", label: "Create", disabled: true });
    const readOnly = render(FormCheckbox, { id: "permission", label: "Create" });

    expect(locked).toMatch(/<button[^>]*role="checkbox"[^>]*disabled=""/);
    expect(locked).not.toContain("aria-readonly");
    expect(locked).toContain('data-state="checked"');
    expect(readOnly).toContain('aria-readonly="true"');
    expect(readOnly).not.toMatch(/<button[^>]*role="checkbox"[^>]*disabled=""/);
  });

  it("disables every option of a locked radio group and keeps the chosen value", () => {
    form.isReadOnly = true;
    const options = [
      { value: "all", label: "All" },
      { value: "none", label: "None" },
    ];
    const locked = render(FormRadioGroup, { id: "readAccess", ariaLabel: "Read access", options, disabled: true });
    const readOnly = render(FormRadioGroup, { id: "readAccess", ariaLabel: "Read access", options });

    const radios = locked.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    for (const radio of radios) expect(radio).toContain('disabled=""');
    expect(radios.find((radio) => radio.includes('value="all"'))).toContain('aria-checked="true"');
    expect(locked).not.toContain("aria-readonly");
    expect(readOnly).toContain('aria-readonly="true"');
    expect(readOnly).not.toContain('disabled=""');
  });
});
