import type { PlanIssue, PlanRow } from "./import-plan";

export type SerializedIssue = {
  code: string;
  path: Array<string | number>;
  message: string;
  customCode?: string;
};

export type SerializedFailure = {
  kind: string;
  issues: SerializedIssue[];
};

export type ImportRowIssue = {
  sheetRow: number | null;
  columnLetter: string | null;
  columnLabel: string | null;
  fieldPath: string;
  message: string;
  code: string;
};

export function fieldPathOf(path: Array<string | number>): string {
  return path
    .slice(2)
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".")
    .replace(/\.\[/g, "[");
}

export function mapFailureToRows(
  failure: SerializedFailure,
  chunk: PlanRow[],
  collectionKey: string,
): ImportRowIssue[] {
  return failure.issues.map((issue) => {
    const [head, index] = issue.path;
    const belongsToRow = head === collectionKey && typeof index === "number";
    const row = belongsToRow ? chunk[index] : undefined;

    return {
      sheetRow: row ? row.sheetRow : null,
      columnLetter: null,
      columnLabel: null,
      fieldPath: belongsToRow ? fieldPathOf(issue.path) : issue.path.join("."),
      message: issue.message,
      code: issue.customCode ?? issue.code,
    };
  });
}

export function planIssueToRowIssue(issue: PlanIssue): ImportRowIssue {
  return {
    sheetRow: issue.sheetRow,
    columnLetter: issue.columnLetter,
    columnLabel: issue.columnLabel,
    fieldPath: "",
    message: issue.message,
    code: issue.code,
  };
}

export function dedupeIssues(issues: ImportRowIssue[]): ImportRowIssue[] {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.sheetRow}|${issue.fieldPath}|${issue.message}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}
