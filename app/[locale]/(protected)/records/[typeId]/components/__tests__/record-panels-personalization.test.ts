import { describe, expect, it } from "vitest";

import { readStoredPanelSizes } from "@/components/layout/resizable-panels.utils";
import { recordPanelsP13nId, recordPanelWidths } from "../record-panels-personalization";

const PANELS = ["details", "notes", "activities"];
const LAYOUT = PANELS.join("-");

describe("record detail panel widths", () => {
  it("keeps panel widths under the type-scoped record-panels key", () => {
    expect(recordPanelsP13nId("type-1")).toBe("record-panels:type-1");
  });

  it("reads widths a member resized on the old detail page from the migrated record-detail row", () => {
    const migratedDetail = {
      columnWidths: {
        [`panel:${LAYOUT}:details`]: 500,
        [`panel:${LAYOUT}:notes`]: 300,
        [`panel:${LAYOUT}:activities`]: 200,
        name: 240,
      },
    };

    const widths = recordPanelWidths(null, migratedDetail);

    expect(widths).toEqual({
      [`panel:${LAYOUT}:details`]: 500,
      [`panel:${LAYOUT}:notes`]: 300,
      [`panel:${LAYOUT}:activities`]: 200,
    });
    expect(readStoredPanelSizes(widths, LAYOUT, PANELS)).toEqual([500, 300, 200]);
  });

  it("prefers widths saved on the generic record page over the migrated ones", () => {
    const saved = { columnWidths: { [`panel:${LAYOUT}:details`]: 700, [`panel:${LAYOUT}:notes`]: 300 } };
    const migratedDetail = { columnWidths: { [`panel:${LAYOUT}:details`]: 100, [`panel:${LAYOUT}:notes`]: 900 } };

    expect(recordPanelWidths(saved, migratedDetail)).toBe(saved.columnWidths);
  });

  it("falls back only to panel widths and otherwise leaves the layout at its defaults", () => {
    expect(recordPanelWidths(null, { columnWidths: { name: 240 } })).toBeUndefined();
    expect(recordPanelWidths({ columnWidths: {} }, null)).toEqual({});
    expect(recordPanelWidths(null, null)).toBeUndefined();
  });
});
