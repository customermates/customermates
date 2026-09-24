import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

const STORE_REPOSITORY: Record<string, string> = {
  "app/[locale]/(protected)/contacts/components/contacts.store.tsx": "features/contacts/prisma-contact.repository.ts",
  "app/[locale]/(protected)/organizations/components/organizations.store.tsx":
    "features/organizations/prisma-organization.repository.ts",
  "app/[locale]/(protected)/deals/components/deals.store.tsx": "features/deals/prisma-deal.repository.ts",
  "app/[locale]/(protected)/services/components/services.store.tsx": "features/services/prisma-service.repository.ts",
  "app/[locale]/(protected)/tasks/components/tasks.store.tsx": "features/tasks/prisma-task.repository.ts",
  "app/[locale]/(protected)/routines/components/routines.store.ts": "ee/routines/prisma-routine.repository.ts",
  "app/[locale]/(protected)/company/components/user/users.store.ts": "features/user/prisma-user.repository.ts",
  "app/[locale]/(protected)/company/components/role/roles.store.tsx": "features/role/prisma-role.repository.ts",
  "app/[locale]/(protected)/company/components/webhook/webhooks.store.ts":
    "features/webhook/prisma-webhook.repository.ts",
  "app/[locale]/(protected)/company/components/webhook/webhook-deliveries.store.ts":
    "features/webhook/prisma-webhook-delivery.repository.ts",
  "app/[locale]/(protected)/company/components/audit-log/audit-logs.store.ts":
    "features/audit-log/prisma-audit-log.repository.ts",
  "app/[locale]/(protected)/operator/components/users/operator-users.store.ts":
    "ee/operator/prisma-operator-users.repository.ts",
  "app/[locale]/(protected)/operator/components/workspaces/operator-workspaces.store.ts":
    "ee/operator/prisma-operator-workspaces.repository.ts",
  "app/[locale]/(protected)/operator/components/audit/operator-audit.store.ts":
    "ee/operator/prisma-operator-audit.repository.ts",
};

const MCP_SORT_CLAIMS: Array<{ file: string; claim: string; fields: string[]; repository: string }> = [
  {
    file: "features/mcp-tools/workspace.mcp-tools.ts",
    claim: 'sortDescription("name, createdAt, updatedAt")',
    fields: ["name", "createdAt", "updatedAt"],
    repository: "features/user/prisma-user.repository.ts",
  },
  {
    file: "features/mcp-tools/webhook.mcp-tools.ts",
    claim: "list: name, createdAt, updatedAt",
    fields: ["name", "createdAt", "updatedAt"],
    repository: "features/webhook/prisma-webhook.repository.ts",
  },
  {
    file: "features/mcp-tools/webhook.mcp-tools.ts",
    claim: "list_deliveries: createdAt",
    fields: ["createdAt"],
    repository: "features/webhook/prisma-webhook-delivery.repository.ts",
  },
  {
    file: "features/mcp-tools/messaging.mcp-tools.ts",
    claim: 'sortDescription("lastMessageAt")',
    fields: ["lastMessageAt"],
    repository: "ee/messaging/persistence/prisma-messaging.repository.ts",
  },
  {
    file: "features/mcp-tools/messaging.mcp-tools.ts",
    claim: 'sortDescription("at (the event time)")',
    fields: ["at"],
    repository: "ee/messaging/activities/prisma-activities.repository.ts",
  },
  {
    file: "features/mcp-tools/messaging.mcp-tools.ts",
    claim: 'sortDescription("name (calendars) or startsAt (events)")',
    fields: ["name"],
    repository: "ee/calendar/prisma-calendar.repository.ts",
  },
  {
    file: "features/mcp-tools/messaging.mcp-tools.ts",
    claim: 'sortDescription("name (calendars) or startsAt (events)")',
    fields: ["startsAt"],
    repository: "ee/calendar/prisma-calendar-events.repository.ts",
  },
];

const RECORD_REPOSITORIES = [
  "features/contacts/prisma-contact.repository.ts",
  "features/organizations/prisma-organization.repository.ts",
  "features/deals/prisma-deal.repository.ts",
  "features/services/prisma-service.repository.ts",
  "features/tasks/prisma-task.repository.ts",
];

function repositorySortableFields(path: string): string[] {
  const source = read(path);
  const start = source.indexOf("getSortableFields() {");
  expect(start, `${path} declares getSortableFields`).toBeGreaterThanOrEqual(0);
  const body = source.slice(start, source.indexOf("\n  }\n", start));

  return [...body.matchAll(/field:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function sortableColumnUids(source: string): string[] {
  return [...source.matchAll(/\{[^{}]*\}/g)]
    .map(([literal]) => literal)
    .filter((literal) => /\bsortable:\s*true\b/.test(literal))
    .flatMap((literal) => /\buid:\s*"([^"]+)"/.exec(literal)?.[1] ?? []);
}

function storeSortableColumns(path: string): string[] {
  return sortableColumnUids(read(path));
}

function dataViewStores(): string[] {
  return walkFiles(
    REPO_ROOT,
    (path) =>
      /\.store\.tsx?$/.test(path) &&
      !path.includes("/__tests__/") &&
      readFileSync(path, "utf8").includes("extends BaseDataViewStore"),
  ).map((path) => relative(REPO_ROOT, path));
}

describe("sortable column detection", () => {
  it("finds a literal sortable column whatever its key order or extra keys", () => {
    const source = `[
      { uid: "name", sortable: true },
      { sortable: true, uid: "amount" },
      { uid: "createdAt", label: t("Common.createdAt"), sortable: true },
      { uid: "status", sortable: false },
      { uid: "notes" },
      ...this.customColumns.map((column) => ({ uid: column.id, label: column.label, sortable: true })),
    ]`;

    expect(sortableColumnUids(source)).toEqual(["name", "amount", "createdAt"]);
  });
});

describe("every sort option a surface offers is one its repository applies", () => {
  it("maps every data view store that offers a sortable column to its repository", () => {
    const offering = dataViewStores().filter((path) => storeSortableColumns(path).length > 0);

    expect(offering.sort()).toEqual(Object.keys(STORE_REPOSITORY).sort());
  });

  it.each(Object.entries(STORE_REPOSITORY))("sorts every column %s marks sortable", (store, repository) => {
    const applied = new Set(repositorySortableFields(repository));
    const unapplied = storeSortableColumns(store).filter((column) => !applied.has(column));

    expect(unapplied, `${store} offers columns ${repository} does not sort on`).toEqual([]);
  });

  it.each(MCP_SORT_CLAIMS)(
    "backs the MCP sort claim $claim with $repository",
    ({ file, claim, fields, repository }) => {
      expect(read(file), file).toContain(claim);

      const applied = new Set(repositorySortableFields(repository));
      expect(fields.filter((field) => !applied.has(field))).toEqual([]);
    },
  );

  it("sorts every record type by name, the example list_records gives", () => {
    expect(read("features/mcp-tools/entity-generic.mcp-tools.ts")).toContain("built-in field name (name, totalValue");

    for (const repository of RECORD_REPOSITORIES)
      expect(repositorySortableFields(repository), repository).toContain("name");
  });
});
