import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (entity: string) => entity }),
}));

vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => null,
    isLoading: false,
    isReadOnly: false,
    onChange: vi.fn(),
  }),
}));

import { FormSelect } from "../form-select";

const NONE = "__none__";
const ITEMS = [
  { value: NONE, label: "Not configured" },
  { value: "stage-column", label: "Stage" },
];

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(FormSelect, {
      id: "dealWeightingColumnId",
      label: "Field",
      placeholder: "Select a field",
      items: ITEMS,
      ...props,
    }),
  );

describe("FormSelect value", () => {
  it("shows the placeholder while the store value is null and no value is given", () => {
    const markup = render({});

    expect(markup).toContain("Select a field");
    expect(markup).not.toContain("Not configured");
  });

  it("shows the item for a controlled value that maps a null store value to a sentinel item", () => {
    const markup = render({ value: NONE });

    expect(markup).toContain("<span>Not configured</span>");
    expect(markup).not.toContain("Select a field");
  });
});
