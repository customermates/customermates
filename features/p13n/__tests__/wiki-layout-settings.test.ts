import { describe, expect, it } from "vitest";

import { P13nEntrySchema } from "../p13n.schema";
import { p13nSettingsSchema, readP13nSettings, WIKI_LAYOUT_P13N_ID } from "../p13n-settings.schema";
import { isWritableP13nId } from "../writable-p13n-id";

describe("the Knowledge Base view a person chose", () => {
  it("is stored under the Knowledge Base layout and read back as the map or the pages", () => {
    expect(isWritableP13nId(WIKI_LAYOUT_P13N_ID)).toBe(true);
    expect(readP13nSettings(WIKI_LAYOUT_P13N_ID, { view: "pages" })).toEqual({ view: "pages" });
    expect(readP13nSettings(WIKI_LAYOUT_P13N_ID, { view: "map" })).toEqual({ view: "map" });
  });

  it("falls back to nothing for an unknown view, extra fields or the settings of another screen", () => {
    expect(readP13nSettings(WIKI_LAYOUT_P13N_ID, { view: "board" })).toBeNull();
    expect(readP13nSettings(WIKI_LAYOUT_P13N_ID, { view: "pages", width: 300 })).toBeNull();
    expect(readP13nSettings(WIKI_LAYOUT_P13N_ID, { singleKeyShortcuts: true })).toBeNull();
    expect(readP13nSettings(WIKI_LAYOUT_P13N_ID, undefined)).toBeNull();
    expect(p13nSettingsSchema("keyboard")?.safeParse({ view: "pages" }).success).toBe(false);
  });

  it("passes through a stored entry unchanged", () => {
    const entry = P13nEntrySchema.safeParse({ p13nId: WIKI_LAYOUT_P13N_ID, settings: { view: "pages" } });

    expect(entry.success && entry.data.settings).toEqual({ view: "pages" });
  });
});
