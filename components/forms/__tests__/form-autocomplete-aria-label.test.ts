import type { ComponentProps } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ isReadOnly: false }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/shared/use-navigate-to-href", () => ({
  useNavigateToHref: () => vi.fn(),
}));

vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => "service-1",
    isLoading: false,
    isReadOnly: form.isReadOnly,
    onChange: vi.fn(),
  }),
}));

import { FormAutocomplete } from "../form-autocomplete";

type Service = { id: string; name: string };
type Props = ComponentProps<typeof FormAutocomplete<Service>>;

const ITEMS: Service[] = [{ id: "service-1", name: "Custom Integrations" }];

function render(props: Partial<Props>) {
  const componentProps: Props = {
    children: (item) => createElement("span", null, item.name),
    id: "services[0].serviceId",
    items: ITEMS,
    renderValue: (items) => items.map((item) => createElement("span", { key: item.key }, item.data?.name)),
    ...props,
  };
  return renderToStaticMarkup(createElement(FormAutocomplete<Service>, componentProps));
}

describe("FormAutocomplete accessible name", () => {
  it("names an editable picker that has no visible label from ariaLabel", () => {
    form.isReadOnly = false;
    const markup = render({ ariaLabel: "Service", label: null });

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Service"');
    expect(markup).not.toContain("<label");
  });

  it("falls back to the placeholder when an editable picker has neither a label nor ariaLabel", () => {
    form.isReadOnly = false;
    const markup = render({ label: null });

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Common.ariaLabels.selectOption"');
  });

  it("names a read-only picker that has no visible label from ariaLabel", () => {
    form.isReadOnly = true;
    const markup = render({ ariaLabel: "Service", label: null });

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Service"');
  });

  it("keeps the visible label as the name when one is shown", () => {
    form.isReadOnly = false;
    const markup = render({ ariaLabel: "Service", label: "Services" });

    expect(markup).toContain("Services");
    expect(markup).not.toContain('aria-label="Service"');
  });
});

describe("stacked picker label ownership", () => {
  it.each([false, true])("binds identical form keys to their own DOM labels when readOnly=%s", (readOnly) => {
    form.isReadOnly = readOnly;
    const first = render({ id: "assignedUserIds", inputId: "assigned-first", label: "First record assignees" });
    const second = render({ id: "assignedUserIds", inputId: "assigned-second", label: "Second record assignees" });
    expect(first).toContain('id="assigned-first-label"');
    expect(first).toContain('id="assigned-first"');
    expect(first).not.toContain("assigned-second");
    expect(second).toContain('id="assigned-second-label"');
    expect(second).toContain('id="assigned-second"');
    expect(second).not.toContain("assigned-first");
    if (readOnly) {
      expect(first).toContain('aria-labelledby="assigned-first-label"');
      expect(second).toContain('aria-labelledby="assigned-second-label"');
    } else {
      expect(first).toContain('for="assigned-first"');
      expect(second).toContain('for="assigned-second"');
    }
  });
});
