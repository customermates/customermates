import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES, solutionDataLocaleForUiLocale } from "./solution-catalog";

const DATA_LOCALE_BY_COMPANY = new Map(
  SOLUTION_CATALOG.flatMap((solution) =>
    SOLUTION_DATA_LOCALES.map((dataLocale) => [solution.companyIds[dataLocale], dataLocale] as const),
  ),
);

export function demoWorkspacesForUiLocale<T extends { companyId: string; isCurrent: boolean }>(
  workspaces: readonly T[],
  uiLocale: string,
): T[] {
  const dataLocale = solutionDataLocaleForUiLocale(uiLocale);
  return workspaces.filter((workspace) => {
    const workspaceLocale = DATA_LOCALE_BY_COMPANY.get(workspace.companyId);
    return workspace.isCurrent || workspaceLocale === undefined || workspaceLocale === dataLocale;
  });
}
