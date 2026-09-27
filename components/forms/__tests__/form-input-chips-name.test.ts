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
    getValue: () => ["anna@example.com"],
    isLoading: false,
    isReadOnly: false,
    onChange: vi.fn(),
  }),
}));

import { FormInputChips } from "../form-input-chips";

function editInput(markup: string) {
  const input = markup.split("<input").at(1);
  if (!input) throw new Error("Expected the editable chip input");
  return input;
}

describe("FormInputChips accessible name", () => {
  it("names the editable input from the visible text it is labelled by when it has no label of its own", () => {
    const markup = renderToStaticMarkup(
      createElement(FormInputChips, {
        arrayMode: true,
        ariaLabelledBy: "inbox-reply-to-label",
        id: "recipients",
        label: null,
      }),
    );

    expect(editInput(markup)).toContain('aria-labelledby="inbox-reply-to-label"');
    expect(markup).not.toContain("<label");
  });

  it("leaves a visibly labelled input to its label", () => {
    const markup = renderToStaticMarkup(
      createElement(FormInputChips, { arrayMode: true, id: "emails", label: "Emails" }),
    );

    expect(markup).toContain("<label");
    expect(editInput(markup)).not.toContain("aria-labelledby");
  });
});
