import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => "9",
    isLoading: false,
    isReadOnly: false,
    onChange: vi.fn(),
  }),
}));

import { FormSelect } from "../form-select";

const ITEMS = [
  { value: "9", label: "09" },
  { value: "10", label: "10" },
];

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(FormSelect, { id: "scheduleHour", items: ITEMS, ...props }));

describe("FormSelect accessible name", () => {
  it("names a trigger that has no visible label from ariaLabel", () => {
    const markup = render({ ariaLabel: "Hour", label: null });

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Hour"');
    expect(markup).not.toContain("<label");
  });

  it("keeps the visible label as the name when one is shown", () => {
    const markup = render({ ariaLabel: "Hour", label: "Start hour" });

    expect(markup).toContain("Start hour");
    expect(markup).not.toContain('aria-label="Hour"');
  });
});
