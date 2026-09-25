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

vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getError: (key: string) => formErrors.current[key],
    getValue: () => ["not-an-email", "person@example.com"],
    isLoading: false,
    isReadOnly: false,
    onChange: vi.fn(),
  }),
}));

import { FormInputChips } from "../form-input-chips";

function render() {
  return renderToStaticMarkup(
    createElement(FormInputChips, { arrayMode: true, id: "emails", inputId: "invite-modal-emails", label: "Emails" }),
  );
}

function labelClass(markup: string): string {
  const match = /<label[^>]*class="([^"]*)"[^>]*>Emails/.exec(markup);
  if (!match) throw new Error(`Expected the Emails label in ${markup}`);
  return match[1];
}

describe("FormInputChips label errors", () => {
  it("colours the label when only one chip has an error", () => {
    formErrors.current = { "emails[0]": ["Enter a valid email address."] };
    const markup = render();

    expect(markup).toContain('aria-invalid="true"');
    expect(labelClass(markup)).toContain("text-destructive");
    expect(labelClass(markup)).not.toContain("text-muted-foreground");
  });

  it("keeps the label muted without errors", () => {
    formErrors.current = {};

    expect(labelClass(render())).not.toContain("text-destructive");
  });
});
