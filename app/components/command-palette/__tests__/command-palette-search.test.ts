import { describe, expect, it } from "vitest";

import type { PaletteCandidate } from "../command-palette-search";
import {
  bestCandidate,
  exactTitleMatch,
  foldText,
  listGroups,
  parsePaletteQuery,
  rankCandidates,
  stableOrder,
} from "../command-palette-search";

const candidates: PaletteCandidate[] = [
  { key: "list:deals", kind: "list", label: "Deals", keywords: ["Deal"] },
  { key: "view:open", kind: "view", label: "Open deals", keywords: [], listKey: "list:deals" },
  { key: "view:won", kind: "view", label: "Won this quarter", keywords: [], listKey: "list:deals" },
  { key: "list:contacts", kind: "list", label: "Contacts", keywords: ["Contact"] },
  { key: "view:vip", kind: "view", label: "VIP", keywords: [], listKey: "list:contacts" },
  { key: "cmd:page.dashboard", kind: "page", label: "Dashboard", keywords: ["home", "overview"] },
  { key: "cmd:setting.profile.theme", kind: "setting", label: "Darstellung", keywords: ["dunkler Modus", "Farben"] },
  { key: "field:stage", kind: "field", label: "Deal stage", keywords: ["Deals"] },
  { key: "cmd:action.add", kind: "action", label: "Add a record or list", keywords: ["new", "create"] },
];

describe("palette query parsing", () => {
  it("reads Linear-style scope prefixes", () => {
    expect(parsePaletteQuery("l deals")).toEqual({ scope: "lists", term: "deals" });
    expect(parsePaletteQuery("v vip")).toEqual({ scope: "views", term: "vip" });
    expect(parsePaletteQuery("s theme")).toEqual({ scope: "settings", term: "theme" });
    expect(parsePaletteQuery("r acme")).toEqual({ scope: "records", term: "acme" });
    expect(parsePaletteQuery("S Corp")).toEqual({ scope: null, term: "S Corp" });
  });

  it("keeps ordinary queries untouched", () => {
    expect(parsePaletteQuery("x deals")).toEqual({ scope: null, term: "x deals" });
    expect(parsePaletteQuery("deals")).toEqual({ scope: null, term: "deals" });
    expect(parsePaletteQuery("l")).toEqual({ scope: null, term: "l" });
  });

  it("folds case and accents", () => {
    expect(foldText("  Préférences   Générales ")).toBe("preferences generales");
    expect(foldText("Übersicht")).toBe("ubersicht");
  });
});

describe("instant ranking", () => {
  it("prefers lists over fields and views on equal matches", () => {
    const ranked = rankCandidates("deal", candidates, null);
    expect(ranked[0]?.key).toBe("list:deals");
    expect(ranked.map((entry) => entry.key)).toContain("field:stage");
  });

  it("matches synonyms in the person's language", () => {
    expect(rankCandidates("dunkler", candidates, null)[0]?.key).toBe("cmd:setting.profile.theme");
    expect(rankCandidates("home", candidates, null)[0]?.key).toBe("cmd:page.dashboard");
  });

  it("matches without accents", () => {
    expect(
      rankCandidates("ubersicht", [{ key: "a", kind: "page", label: "Übersicht", keywords: [] }], null),
    ).toHaveLength(1);
  });

  it("lists the whole scope for a bare prefix", () => {
    expect(rankCandidates("", candidates, "views").map((entry) => entry.key)).toEqual([
      "view:open",
      "view:won",
      "view:vip",
    ]);
    expect(rankCandidates("", candidates, null)).toEqual([]);
  });

  it("limits candidates to the prefix scope", () => {
    expect(rankCandidates("deal", candidates, "views").map((entry) => entry.kind)).toEqual(["view"]);
    expect(rankCandidates("deal", candidates, "settings").map((entry) => entry.key)).toEqual(["field:stage"]);
    expect(rankCandidates("deal", candidates, "records")).toEqual([]);
  });
});

describe("best match", () => {
  it("picks one confident target", () => {
    expect(bestCandidate("deals", rankCandidates("deals", candidates, null))?.key).toBe("list:deals");
    expect(bestCandidate("dash", rankCandidates("dash", candidates, null))?.key).toBe("cmd:page.dashboard");
  });

  it("stays empty for single letters, weak matches and ambiguous ties", () => {
    expect(bestCandidate("d", rankCandidates("d", candidates, null))).toBeNull();
    expect(bestCandidate("dunkler", rankCandidates("dunkler", candidates, null))).toBeNull();
    const twins: PaletteCandidate[] = [
      { key: "a", kind: "list", label: "Partners", keywords: [] },
      { key: "b", kind: "list", label: "Partner programs", keywords: [] },
    ];
    expect(bestCandidate("part", rankCandidates("part", twins, null))).toBeNull();
    expect(bestCandidate("partners", rankCandidates("partners", twins, null))?.key).toBe("a");
  });

  it("recognises an exact record title", () => {
    expect(exactTitleMatch("acme gmbh", "ACME GmbH")).toBe(true);
    expect(exactTitleMatch("acme", "ACME GmbH")).toBe(false);
  });
});

describe("lists with their views", () => {
  it("indents every view below a matching list", () => {
    const groups = listGroups(rankCandidates("deals", candidates, null), candidates);
    expect(groups[0]?.list.key).toBe("list:deals");
    expect(groups[0]?.views.map((view) => view.key)).toEqual(["view:open", "view:won"]);
  });

  it("finds a view by its own name below its list", () => {
    const groups = listGroups(rankCandidates("vip", candidates, null), candidates);
    expect(groups).toEqual([
      {
        list: expect.objectContaining({ key: "list:contacts" }),
        views: [expect.objectContaining({ key: "view:vip" })],
      },
    ]);
  });

  it("leaves out the list shown as best match", () => {
    expect(listGroups(rankCandidates("deals", candidates, null), candidates, "list:deals")).toEqual([]);
  });
});

describe("stable order", () => {
  it("never moves rows the person already sees and appends late arrivals", () => {
    expect(stableOrder(["a", "b", "c"], ["x", "c", "a", "b"])).toEqual(["a", "b", "c", "x"]);
    expect(stableOrder(["a", "b"], ["b"])).toEqual(["b"]);
  });
});

describe("record context", () => {
  it("ranks the open record's actions above equal workspace matches", () => {
    const withRecord: PaletteCandidate[] = [
      ...candidates,
      { key: "record:field:stage", kind: "action", label: "Change Stage…", keywords: ["Stage"], contextual: true },
      { key: "field:stage-exact", kind: "field", label: "Stage", keywords: [] },
    ];
    const ranked = rankCandidates("stage", withRecord, null);
    expect(ranked[0]?.key).toBe("record:field:stage");
    expect(bestCandidate("stage", ranked)?.key).toBe("record:field:stage");
  });
});
