import { describe, expect, it, vi } from "vitest";

import { STATIC_COMMANDS } from "@/components/keyboard/command-registry";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { parseRecordSearchTerm } from "@/features/records/search-records.interactor";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { searchCatalogText, staticSearchCatalog, workspaceSearchCatalog } from "../search-catalog-corpus";
import { docsHref } from "../search-command-catalog.interactor";

vi.mock("@/env", () => ({ env: { APP_MODE: "cloud" } }));

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";

describe("search catalog corpus", () => {
  it("holds every command in every app locale with its parent, label and synonyms", async () => {
    const catalog = await staticSearchCatalog();
    expect(catalog.entries).toHaveLength(STATIC_COMMANDS.length * APP_LOCALES.length);
    const german = catalog.entries.find(
      (entry) => entry.locale === "de" && entry.targetId === "cmd:setting.profile.theme",
    );
    expect(german?.text).toBe(
      "Profil & Einstellungen > Darstellung. Aussehen, dunkel, hell, dunkler Modus, heller Modus, Farben, Theme",
    );
    expect((await staticSearchCatalog()).buildHash).toBe(catalog.buildHash);
  });

  it("indexes navigable list, view and field names only", () => {
    const model = createCrmPreset(COMPANY_ID);
    const id = (key: string) => presetId(COMPANY_ID, key);
    const hidden = model.types.find((type) => type.id === id("task"));
    if (hidden) hidden.navigationVisible = false;
    const archivedField = model.fields.find((field) => field.id === id("organization.name"));
    if (archivedField) archivedField.archived = true;
    const entries = workspaceSearchCatalog(model, [
      { typeId: id("organization"), id: "view-1", name: "Key accounts" },
      { typeId: id("task"), id: "view-2", name: "Overdue" },
    ]);
    const keys = entries.map((entry) => entry.targetId);

    expect(keys).toContain(`list:${id("organization")}`);
    expect(keys).not.toContain(`list:${id("task")}`);
    expect(keys).not.toContain(`field:${id("organization.name")}`);
    expect(keys.filter((key) => key.startsWith("view:"))).toEqual(["view:view-1"]);
    expect(entries.find((entry) => entry.targetId === "view:view-1")?.text).toBe("Key accounts. Organizations");
    expect(keys.some((key) => model.types.some((type) => type.embedded && key === `list:${type.id}`))).toBe(false);
  });

  it("hashes the normalized text so unchanged names keep their embedding", () => {
    expect(searchCatalogText("list:a", [" Deals ", "", null]).contentHash).toBe(
      searchCatalogText("view:b", ["Deals"]).contentHash,
    );
    expect(searchCatalogText("list:a", ["Deals"]).text).toBe("Deals");
  });
});

describe("record search terms", () => {
  it("matches a quoted phrase exactly and allows similar titles otherwise", () => {
    expect(parseRecordSearchTerm('"Acme Corp"')).toEqual({ term: "Acme Corp", similarTitles: false });
    expect(parseRecordSearchTerm("Acme")).toEqual({ term: "Acme", similarTitles: true });
    expect(parseRecordSearchTerm("Ac")).toEqual({ term: "Ac", similarTitles: false });
    expect(parseRecordSearchTerm('""')).toEqual({ term: '""', similarTitles: false });
  });
});

describe("docs hits", () => {
  it("open the first app place a docs section links to, else the docs section", () => {
    expect(docsHref("app-search", "faq", "Open [Profile](app:settings/profile) to change it.")).toBe(
      "/settings/profile",
    );
    expect(docsHref("app-search", "faq", "Plain text.")).toBe("/docs/app-search#faq");
  });
});
