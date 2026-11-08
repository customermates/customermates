import { identityKeys, isLinkedinMemberId } from "./record-identity";

export type LinkedinIdentityRef = { typeId: string; recordId: string };

export type LinkedinIdentityRow = {
  id: string;
  value: string;
  messagingId: string | null;
  displayName: string | null;
  profileUrl: string | null;
  createdAt: string;
  keys: string[];
  records: LinkedinIdentityRef[];
};

export type LinkedinIdentityMerge = {
  survivorId: string;
  mergedIds: string[];
  value: string;
  messagingId: string | null;
  displayName: string | null;
  profileUrl: string | null;
  keys: string[];
  records: LinkedinIdentityRef[];
};

export type LinkedinKeyBackfill = { identityId: string; keys: string[] };

export type LinkedinSkipReason = "memberIdConflict" | "differentRecords" | "excludedRecord";

export type LinkedinIdentityPlan = {
  identities: number;
  merges: LinkedinIdentityMerge[];
  backfills: LinkedinKeyBackfill[];
  skipped: Array<{ identityIds: string[]; reason: LinkedinSkipReason }>;
};

const refKey = (ref: LinkedinIdentityRef) => `${ref.typeId}:${ref.recordId}`;

function rowKeys(row: LinkedinIdentityRow): string[] {
  return identityKeys({ provider: "linkedin", ...row, aliases: row.keys });
}

function groups(rows: LinkedinIdentityRow[]): LinkedinIdentityRow[][] {
  const parent = new Map(rows.map((row) => [row.id, row.id]));
  const root = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current) ?? current;
    parent.set(id, current);
    return current;
  };
  const holder = new Map<string, string>();
  for (const row of rows) {
    for (const key of rowKeys(row)) {
      const other = holder.get(key);
      if (other) parent.set(root(row.id), root(other));
      else holder.set(key, row.id);
    }
  }
  const grouped = new Map<string, LinkedinIdentityRow[]>();
  for (const row of rows) grouped.set(root(row.id), [...(grouped.get(root(row.id)) ?? []), row]);
  return [...grouped.values()];
}

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function byAge(left: LinkedinIdentityRow, right: LinkedinIdentityRow): number {
  return compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id);
}

function merge(group: LinkedinIdentityRow[]): LinkedinIdentityMerge {
  const ordered = [...group].sort(byAge);
  const survivor = ordered.find((row) => !isLinkedinMemberId(row.value)) ?? ordered[0];
  if (!survivor) throw new Error("A LinkedIn identity group cannot be empty");
  const others = ordered.filter((row) => row.id !== survivor.id);
  const memberId = ordered.flatMap((row) => rowKeys(row)).find(isLinkedinMemberId) ?? null;
  const first = <K extends "displayName" | "profileUrl" | "messagingId">(field: K) =>
    survivor[field] ?? others.find((row) => row[field])?.[field] ?? null;
  return {
    survivorId: survivor.id,
    mergedIds: others.map((row) => row.id),
    value: survivor.value,
    messagingId: memberId ?? first("messagingId"),
    displayName: first("displayName"),
    profileUrl: first("profileUrl"),
    keys: [...new Set(ordered.flatMap(rowKeys))],
    records: [...new Map(ordered.flatMap((row) => row.records).map((ref) => [refKey(ref), ref])).values()],
  };
}

export function planLinkedinIdentityConsolidation(
  rows: LinkedinIdentityRow[],
  options: { excludeRecordIds?: ReadonlySet<string> } = {},
): LinkedinIdentityPlan {
  const plan: LinkedinIdentityPlan = {
    identities: rows.length,
    merges: [],
    backfills: [],
    skipped: [],
  };
  for (const group of groups(rows)) {
    const identityIds = group.map((row) => row.id).sort();
    if (group.some((row) => row.records.some((ref) => options.excludeRecordIds?.has(ref.recordId)))) {
      if (group.length > 1) plan.skipped.push({ identityIds, reason: "excludedRecord" });
      continue;
    }
    if (group.length === 1) {
      const [row] = group;
      if (!row) continue;
      const missing = rowKeys(row).filter((key) => !row.keys.includes(key));
      if (missing.length) plan.backfills.push({ identityId: row.id, keys: missing });
      continue;
    }
    if (new Set(group.flatMap(rowKeys).filter(isLinkedinMemberId)).size > 1) {
      plan.skipped.push({ identityIds, reason: "memberIdConflict" });
      continue;
    }
    const records = group.map((row) => row.records.map(refKey).sort().join(","));
    if (new Set(records).size > 1) {
      plan.skipped.push({ identityIds, reason: "differentRecords" });
      continue;
    }
    plan.merges.push(merge(group));
  }
  return plan;
}
