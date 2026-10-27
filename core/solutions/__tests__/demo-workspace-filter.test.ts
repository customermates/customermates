import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";

import { demoWorkspacesForUiLocale } from "../demo-workspace-filter";
import {
  SOLUTION_CATALOG,
  SOLUTION_DATA_LOCALES,
  findSolution,
  solutionDataLocaleForUiLocale,
} from "../solution-catalog";

const workspace = (companyId: string, isCurrent = false) => ({ companyId, isCurrent });

const all = SOLUTION_CATALOG.flatMap((solution) =>
  SOLUTION_DATA_LOCALES.map((dataLocale) => workspace(solution.companyIds[dataLocale])),
);

describe("demoWorkspacesForUiLocale", () => {
  it("lists exactly the workspaces whose data locale matches the interface language", () => {
    for (const uiLocale of APP_LOCALES) {
      const dataLocale = solutionDataLocaleForUiLocale(uiLocale);
      const expected = SOLUTION_CATALOG.map((solution) => solution.companyIds[dataLocale]);

      expect(
        demoWorkspacesForUiLocale(all, uiLocale).map(({ companyId }) => companyId),
        uiLocale,
      ).toEqual(expected);
    }
  });

  it("shows German data in the German interface and English data in every other one", () => {
    const smb = findSolution("smb");
    const listed = (uiLocale: string) =>
      demoWorkspacesForUiLocale([workspace(smb.companyIds.en), workspace(smb.companyIds.de)], uiLocale);

    expect(listed("de")).toEqual([workspace(smb.companyIds.de)]);
    expect(listed("en")).toEqual([workspace(smb.companyIds.en)]);
    expect(listed("fr")).toEqual([workspace(smb.companyIds.en)]);
  });

  it("keeps the current workspace and workspaces outside the catalog", () => {
    const agencies = findSolution("agencies");
    const outside = workspace("90000000-0000-4000-8000-000000000001");
    const current = workspace(agencies.companyIds.de, true);

    expect(demoWorkspacesForUiLocale([outside, current], "en")).toEqual([outside, current]);
  });
});
