import { describe, expect, it } from "vitest";

import { presetId } from "@/features/records/crm-preset";
import { SidebarLayoutSchema } from "@/features/p13n/sidebar-layout.schema";
import { resolveSidebar } from "@/app/components/navigation/sidebar-layout";

import { SEED_IDS } from "../seeds/context";
import { northwindSidebarLayout } from "../seeds/sidebar";

const list = (key: string) => `records:${presetId(SEED_IDS.company, key)}`;
const sectionNames = (member: Parameters<typeof northwindSidebarLayout>[1]) =>
  northwindSidebarLayout(SEED_IDS.company, member).entries.map((entry) =>
    "item" in entry ? entry.item : (entry.name ?? entry.id),
  );

describe("synthetic sidebar layouts", () => {
  it("gives the admin every team section with its lists in order", () => {
    const layout = northwindSidebarLayout(SEED_IDS.company, "maxBergmann");
    expect(SidebarLayoutSchema.parse(layout)).toEqual(layout);
    expect(sectionNames("maxBergmann")).toEqual([
      "overview",
      "Sales",
      "Customer success",
      "Support",
      "Marketing",
      "Hiring",
      "Work",
    ]);
    expect(layout.entries[1]).toMatchObject({
      items: ["organization", "contact", "deal", "service", "partner"].map(list),
    });
    expect(layout.hidden).toEqual([]);
  });

  it("puts each member's team first and hides the lists their role cannot read", () => {
    expect(sectionNames("sofiaRossi")[0]).toBe("Sales");
    expect(sectionNames("claraNeumann")[0]).toBe("Sales");
    expect(sectionNames("elenaHoffmann")[0]).toBe("Customer success");
    expect(sectionNames("kianRahimi")).toEqual(["Support", "overview", "Sales", "Customer success", "Work"]);
    expect(sectionNames("lauraFischer")).toEqual(["Hiring", "overview", "Work"]);
    const kian = northwindSidebarLayout(SEED_IDS.company, "kianRahimi");
    expect(kian.hidden).toEqual(expect.arrayContaining([list("deal"), list("candidate"), list("campaign")]));
    expect(JSON.stringify(kian.entries)).not.toContain(list("deal"));
  });

  it("leaves Configure and Trash where the app places them", () => {
    const defaults = [
      { kind: "section" as const, id: "overview", items: ["dashboard", "wiki", "inbox", "routines"] },
      { kind: "section" as const, id: "data", items: [list("deal"), "configure-records"] },
      { kind: "item" as const, id: "trash" },
    ];
    const resolved = resolveSidebar(defaults, northwindSidebarLayout(SEED_IDS.company, "maxBergmann"));
    expect(resolved.entries.slice(-2)).toEqual([
      { kind: "item", id: "configure-records" },
      { kind: "item", id: "trash" },
    ]);
  });
});
