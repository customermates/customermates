import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
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

const COLUMN_HOOK_STORE: Record<string, string> = {
  "app/[locale]/(protected)/contacts/components/use-contact-columns.tsx":
    "app/[locale]/(protected)/contacts/components/contacts.store.tsx",
  "app/[locale]/(protected)/organizations/components/use-organization-columns.tsx":
    "app/[locale]/(protected)/organizations/components/organizations.store.tsx",
  "app/[locale]/(protected)/deals/components/use-deal-columns.tsx":
    "app/[locale]/(protected)/deals/components/deals.store.tsx",
  "app/[locale]/(protected)/services/components/use-service-columns.tsx":
    "app/[locale]/(protected)/services/components/services.store.tsx",
  "app/[locale]/(protected)/tasks/components/use-task-columns.tsx":
    "app/[locale]/(protected)/tasks/components/tasks.store.tsx",
  "app/[locale]/(protected)/routines/components/use-routine-columns.tsx":
    "app/[locale]/(protected)/routines/components/routines.store.ts",
  "app/[locale]/(protected)/company/components/user/use-member-columns.tsx":
    "app/[locale]/(protected)/company/components/user/users.store.ts",
  "app/[locale]/(protected)/company/components/role/use-role-columns.tsx":
    "app/[locale]/(protected)/company/components/role/roles.store.tsx",
  "app/[locale]/(protected)/company/components/webhook/use-webhook-columns.tsx":
    "app/[locale]/(protected)/company/components/webhook/webhooks.store.ts",
  "app/[locale]/(protected)/company/components/webhook/use-webhook-delivery-columns.tsx":
    "app/[locale]/(protected)/company/components/webhook/webhook-deliveries.store.ts",
  "app/[locale]/(protected)/company/components/audit-log/use-audit-log-columns.tsx":
    "app/[locale]/(protected)/company/components/audit-log/audit-logs.store.ts",
  "app/[locale]/(protected)/operator/components/users/use-operator-user-columns.tsx":
    "app/[locale]/(protected)/operator/components/users/operator-users.store.ts",
  "app/[locale]/(protected)/operator/components/workspaces/use-operator-workspace-columns.tsx":
    "app/[locale]/(protected)/operator/components/workspaces/operator-workspaces.store.ts",
  "app/[locale]/(protected)/operator/components/audit/use-operator-audit-columns.tsx":
    "app/[locale]/(protected)/operator/components/audit/operator-audit.store.ts",
};

const REPOSITORY_MODEL: Record<string, string> = {
  "features/contacts/prisma-contact.repository.ts": "Contact",
  "features/organizations/prisma-organization.repository.ts": "Organization",
  "features/deals/prisma-deal.repository.ts": "Deal",
  "features/services/prisma-service.repository.ts": "Service",
  "features/tasks/prisma-task.repository.ts": "Task",
  "ee/routines/prisma-routine.repository.ts": "Routine",
  "features/user/prisma-user.repository.ts": "User",
  "features/role/prisma-role.repository.ts": "UserRole",
  "features/webhook/prisma-webhook.repository.ts": "Webhook",
  "features/webhook/prisma-webhook-delivery.repository.ts": "WebhookDelivery",
  "features/audit-log/prisma-audit-log.repository.ts": "AuditLog",
  "ee/operator/prisma-operator-users.repository.ts": "User",
  "ee/operator/prisma-operator-workspaces.repository.ts": "Company",
  "ee/operator/prisma-operator-audit.repository.ts": "AuditLog",
  "ee/messaging/persistence/prisma-messaging.repository.ts": "MessagingThread",
  "ee/calendar/prisma-calendar.repository.ts": "Calendar",
  "ee/calendar/prisma-calendar-events.repository.ts": "CalendarEvent",
};

const COMPUTED_SORT_REPOSITORIES = ["ee/messaging/activities/prisma-activities.repository.ts"];

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

type SortableEntry = { field: string; resolvedFields: string[]; collate: boolean; nullable: boolean };

type ModelField = { type: string; optional: boolean };

function repositorySortableEntries(path: string): SortableEntry[] {
  const source = read(path);
  const start = source.indexOf("getSortableFields() {");
  expect(start, `${path} declares getSortableFields`).toBeGreaterThanOrEqual(0);
  const body = source.slice(start, source.indexOf("\n  }\n", start));

  return [...body.matchAll(/\{[^{}]*\}/g)].flatMap(([literal]) => {
    const field = /\bfield:\s*"([^"]+)"/.exec(literal)?.[1];
    if (!field) return [];

    return [
      {
        field,
        resolvedFields: [.../\bresolvedFields:\s*\[([^\]]*)\]/.exec(literal)?.[1].matchAll(/"([^"]+)"/g) ?? []].map(
          (match) => match[1],
        ),
        collate: /\bcollate:\s*true\b/.test(literal),
        nullable: /\bnullable:\s*true\b/.test(literal),
      },
    ];
  });
}

function repositorySortableFields(path: string): string[] {
  return repositorySortableEntries(path).map(({ field }) => field);
}

function columnLiterals(source: string): Array<{ uid: string; sortable: boolean }> {
  return [...source.matchAll(/\{[^{}]*\}/g)]
    .map(([literal]) => literal)
    .flatMap((literal) => {
      const uid = /\buid:\s*"([^"]+)"/.exec(literal)?.[1];
      return uid ? [{ uid, sortable: /\bsortable:\s*true\b/.test(literal) }] : [];
    });
}

function sortableColumnUids(source: string): string[] {
  return columnLiterals(source)
    .filter(({ sortable }) => sortable)
    .map(({ uid }) => uid);
}

function storeSortableColumns(path: string): string[] {
  return sortableColumnUids(read(path));
}

function stringProperty(node: ts.ObjectLiteralExpression, name: string): string | undefined {
  const property = node.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) && ts.isIdentifier(candidate.name) && candidate.name.text === name,
  );
  if (!property) return undefined;

  if (ts.isStringLiteralLike(property.initializer)) return property.initializer.text;
  if (property.initializer.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (property.initializer.kind === ts.SyntaxKind.FalseKeyword) return "false";

  return "expression";
}

function headerSortableColumns(source: string): string[] {
  const file = ts.createSourceFile("columns.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const accessor = stringProperty(node, "accessorKey") ?? stringProperty(node, "accessorFn");
      const enableSorting = stringProperty(node, "enableSorting");
      const id = stringProperty(node, "id") ?? accessor;
      if (id && enableSorting !== "false" && (accessor !== undefined || enableSorting === "true")) found.push(id);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return found;
}

function prismaModelFields(model: string): Map<string, ModelField> {
  const schema = read("prisma/schema.prisma");
  const start = schema.search(new RegExp(`^model ${model} \\{`, "m"));
  expect(start, `schema.prisma declares model ${model}`).toBeGreaterThanOrEqual(0);
  const body = schema.slice(start, schema.indexOf("\n}", start));

  return new Map(
    [...body.matchAll(/^\s+(\w+)\s+(\w+)(\[\])?(\?)?/gm)].map((match) => [
      match[1],
      { type: match[2], optional: match[4] === "?" },
    ]),
  );
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

  it.each(Object.entries(STORE_REPOSITORY))("offers every sort %s has a column for", (store, repository) => {
    const applied = new Set(repositorySortableFields(repository));
    const withheld = columnLiterals(read(store))
      .filter(({ uid, sortable }) => applied.has(uid) && !sortable)
      .map(({ uid }) => uid);

    expect(withheld, `${repository} sorts these columns, but ${store} does not offer them`).toEqual([]);
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

describe("every column header that sorts is one its repository applies", () => {
  it("maps every column hook to the store behind its page", () => {
    const hooks = walkFiles(REPO_ROOT, (path) => /\/use-[a-z-]+-columns\.tsx$/.test(path) && path.includes("/app/"))
      .map((path) => relative(REPO_ROOT, path))
      .filter((path) => !path.includes("/__tests__/"));

    expect(hooks.sort()).toEqual(Object.keys(COLUMN_HOOK_STORE).sort());
    expect([...new Set(Object.values(COLUMN_HOOK_STORE))].sort()).toEqual(Object.keys(STORE_REPOSITORY).sort());
  });

  it("detects a column TanStack would sort from its accessor or an explicit enableSorting", () => {
    const source = `[
      { id: "name", header: "Name", cell: ({ row }) => <span>{row.original.name}</span> },
      { accessorKey: "email", id: "email", cell: ({ row }) => <span>{row.original.email}</span> },
      { accessorKey: "createdAt" },
      { id: "status", enableSorting: true },
      { accessorKey: "adProvider", id: "adProvider", enableSorting: false },
    ]`;

    expect(headerSortableColumns(source)).toEqual(["email", "createdAt", "status"]);
  });

  it.each(Object.entries(COLUMN_HOOK_STORE))("sorts every header %s makes sortable", (hook, store) => {
    const repository = STORE_REPOSITORY[store];
    const applied = new Set(repositorySortableFields(repository));
    const unapplied = headerSortableColumns(read(hook)).filter((column) => !applied.has(column));

    expect(unapplied, `${hook} gives these headers a sort button that ${repository} cannot sort`).toEqual([]);
  });

  it("turns sorting off in the data view for every column its store does not mark sortable", () => {
    const content = read("components/data-view/data-view-content.tsx");

    expect(content).toContain("store.sortableColumnIds.has(column.id)");
    expect(content).toContain("enableSorting: false");
  });
});

describe("every built-in sort orders the way custom columns and group headers do", () => {
  it("maps every repository that declares sortable fields to its Prisma model", () => {
    const declaring = walkFiles(REPO_ROOT, (path) => /prisma-[a-z-]+\.repository\.ts$/.test(path))
      .map((path) => relative(REPO_ROOT, path))
      .filter((path) => !path.includes("__tests__") && read(path).includes("getSortableFields() {"));

    expect(declaring.sort()).toEqual([...Object.keys(REPOSITORY_MODEL), ...COMPUTED_SORT_REPOSITORIES].sort());
  });

  it.each(Object.entries(REPOSITORY_MODEL))(
    "collates text and puts empty values last in %s",
    (repository, model) => {
      const fields = prismaModelFields(model);
      const lists = read(repository).includes("this.list(");

      for (const entry of repositorySortableEntries(repository)) {
        const columns = entry.resolvedFields.map((path) => {
          expect(path, `${repository} sorts ${entry.field} by a column of ${model}`).not.toContain(".");
          const column = fields.get(path);
          expect(column, `${model} has a column ${path}`).toBeDefined();
          return column as ModelField;
        });
        const text = columns.some((column) => column.type === "String");
        const optional = columns.some((column) => column.optional);

        expect(entry.collate, `${repository} ${entry.field} is text, so it needs collate: true`).toBe(text);
        expect(entry.nullable, `${repository} ${entry.field} can be empty, so it needs nullable: true`).toBe(
          optional && !text,
        );
        if (entry.collate) expect(lists, `${repository} collates ${entry.field}, so it must read through list()`).toBe(true);
      }
    },
  );
});
