import type { AddressIssue } from "@/features/addresses/address-check";
import type { RecordField } from "./record-model.schema";
import type { RecordWriteWarning } from "./record-query.schema";

import { isBlockingAddressIssue } from "@/features/addresses/address-check";
import { addressIssueText } from "@/features/addresses/address-issue-text";

export type FieldAddressIssues = { recordId: string; field: RecordField; issues: AddressIssue[] };

const MAX_WARNING_RECORDS = 20;

export function addressIssueMessage(issue: AddressIssue, label: string): string {
  return `${label}: ${addressIssueText(issue)}`;
}

function warningKey(warning: Omit<RecordWriteWarning, "recordIds">): string {
  return JSON.stringify([warning.fieldId, warning.code, warning.part, warning.expected ?? []]);
}

function grouped(entries: Array<{ recordId: string; warning: Omit<RecordWriteWarning, "recordIds"> }>) {
  const groups = new Map<string, RecordWriteWarning>();
  for (const { recordId, warning } of entries) {
    const key = warningKey(warning);
    const group = groups.get(key);
    if (!group) groups.set(key, { ...warning, recordIds: [recordId] });
    else if (group.recordIds.length < MAX_WARNING_RECORDS && !group.recordIds.includes(recordId))
      group.recordIds.push(recordId);
  }
  return [...groups.values()];
}

export function addressWarnings(entries: readonly FieldAddressIssues[]): RecordWriteWarning[] {
  return grouped(
    entries.flatMap(({ recordId, field, issues }) =>
      issues
        .filter((issue) => !isBlockingAddressIssue(issue))
        .map((issue) => ({
          recordId,
          warning: {
            code: issue.code as RecordWriteWarning["code"],
            fieldId: field.id,
            part: issue.part,
            ...(issue.expected?.length ? { expected: issue.expected } : {}),
            message: addressIssueMessage(issue, field.label),
          },
        })),
    ),
  );
}

export function mergeRecordWriteWarnings(
  lists: ReadonlyArray<readonly RecordWriteWarning[] | undefined>,
): RecordWriteWarning[] {
  return grouped(
    lists.flatMap((warnings) =>
      (warnings ?? []).flatMap(({ recordIds, ...warning }) => recordIds.map((recordId) => ({ recordId, warning }))),
    ),
  );
}
