import type { ComponentProps } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ isReadOnly: false }));

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
