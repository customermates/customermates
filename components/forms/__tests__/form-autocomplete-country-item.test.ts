import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const rootStore = vi.hoisted(() => ({ appMode: "self-hosted" as "cloud" | "self-hosted" }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => rootStore }));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  AvatarFallback: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  AvatarImage: ({ src }: { src: string }) => createElement("img", { src }),
}));

import { FormAutocompleteCountryItem } from "../form-autocomplete-country-item";

function markup() {
  return renderToStaticMarkup(createElement(FormAutocompleteCountryItem, { countryKey: "de", label: "Germany" }));
}

describe("FormAutocompleteCountryItem", () => {
  it("shows an emoji flag instead of loading one from flagcdn.com on a self-hosted instance", () => {
    rootStore.appMode = "self-hosted";

    expect(markup()).not.toContain("flagcdn.com");
    expect(markup()).toContain("\u{1F1E9}\u{1F1EA}");
    expect(markup()).toContain("Germany");
  });

  it("keeps the flag image on cloud", () => {
    rootStore.appMode = "cloud";

    expect(markup()).toContain("https://flagcdn.com/de.svg");
  });
});
