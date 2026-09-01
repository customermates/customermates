import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { ExportColumn } from "../workbook-columns";
import type { RelationSheet, WorkbookRow } from "../workbook-writer";
import type { WorkbookCellValue } from "../workbook-cell";

import type { MessagingProvider } from "@/generated/prisma";
import { EntityType } from "@/generated/prisma";

import { CHANNELS_SHEET_NAME, SERVICES_SHEET_NAME } from "../data-transfer.schema";
import { channelLabelKey } from "@/ee/messaging/provider";
import { IDENTIFIER_TARGET_PREFIX } from "../import/import-mapping";
import { RECORD_ID_COLUMN_KEY, resolveCustomFieldCell, STORED_MULTI_VALUE_SEPARATOR } from "../workbook-columns";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";

type NamedReference = { id: string; name: string };
type PersonReference = { id: string; firstName: string; lastName: string };
type TaskReference = { id: string; name: string; type: string };
type ServiceReference = { id: string; name: string; amount: number; quantity?: number };

export type ExportableRecord = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  notes?: unknown;
  createdAt: Date;
  updatedAt: Date;
  amount?: number;
  totalValue?: number;
  totalQuantity?: number;
  weightedValue?: number | null;
  customFieldValues: CustomFieldValueDto[];
  users?: PersonReference[];
  contacts?: PersonReference[];
  organizations?: NamedReference[];
  deals?: NamedReference[];
  tasks?: TaskReference[];
  services?: ServiceReference[];
  identifiers?: Array<{ id: string; provider: string; value: string; displayName?: string | null }>;
};

export const RELATION_SHEET_NAMES = {
  channels: CHANNELS_SHEET_NAME,
  contacts: "Contacts",
  deals: "Deals",
  organizations: "Organizations",
  services: SERVICES_SHEET_NAME,
  tasks: "Tasks",
  users: "Assigned",
} as const;

export const ENTITY_SHEET_NAME: Record<EntityType, string> = {
  [EntityType.contact]: "Contacts",
  [EntityType.organization]: "Organizations",
  [EntityType.deal]: "Deals",
  [EntityType.service]: "Services",
  [EntityType.task]: "Tasks",
};

const RELATION_HEADERS = {
  channels: ["row", "recordId", "provider", "value", "displayName"],
  contacts: ["row", "recordId", "contactId", "contactName"],
  deals: ["row", "recordId", "dealId", "dealName"],
  organizations: ["row", "recordId", "organizationId", "organizationName"],
  services: ["row", "recordId", "serviceId", "serviceName", "amount", "quantity"],
  tasks: ["row", "recordId", "taskId", "taskName", "taskType"],
  users: ["row", "recordId", "userId", "userName"],
} as const;

function personName(person: PersonReference): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function joinNames(values: string[]): string | null {
  return values.length > 0 ? values.join(`${STORED_MULTI_VALUE_SEPARATOR} `) : null;
}

function notesToMarkdown(notes: unknown): string | null {
  if (!notes || typeof notes !== "object") return null;

  const markdown = serializeJSONToMarkdown(notes).trim();
  return markdown.length > 0 ? markdown : null;
}

function channelCell(record: ExportableRecord, provider: string): WorkbookCellValue {
  const values = (record.identifiers ?? [])
    .filter((identifier) => channelLabelKey(identifier.provider as MessagingProvider) === provider)
    .map((identifier) => identifier.value);

  return joinNames(values);
}

function standardCell(record: ExportableRecord, key: string): WorkbookCellValue {
  switch (key) {
    case RECORD_ID_COLUMN_KEY:
      return record.id;
    case "name":
      return record.name ?? `${record.firstName ?? ""} ${record.lastName ?? ""}`.trim();
    case "firstName":
      return record.firstName ?? null;
    case "lastName":
      return record.lastName ?? null;
    case "notes":
      return notesToMarkdown(record.notes);
    case "createdAt":
      return record.createdAt;
    case "updatedAt":
      return record.updatedAt;
    case "amount":
      return record.amount ?? null;
    case "totalValue":
      return record.totalValue ?? null;
    case "totalQuantity":
      return record.totalQuantity ?? null;
    case "weightedValue":
      return record.weightedValue ?? null;
    case "channels":
      return joinNames((record.identifiers ?? []).map((identifier) => identifier.value));
    case "users":
      return joinNames((record.users ?? []).map(personName));
    case "contacts":
      return joinNames((record.contacts ?? []).map(personName));
    case "organizations":
      return joinNames((record.organizations ?? []).map((organization) => organization.name));
    case "deals":
      return joinNames((record.deals ?? []).map((deal) => deal.name));
    case "tasks":
      return joinNames((record.tasks ?? []).map((task) => task.name));
    case "services":
      return joinNames((record.services ?? []).map((service) => service.name));
    default:
      return key.startsWith(IDENTIFIER_TARGET_PREFIX)
        ? channelCell(record, key.slice(IDENTIFIER_TARGET_PREFIX.length))
        : null;
  }
}

export function toWorkbookRow(record: ExportableRecord, columns: ExportColumn[]): WorkbookRow {
  const row: WorkbookRow = {};

  for (const column of columns) {
    row[column.key] = column.customColumn
      ? resolveCustomFieldCell(column.customColumn, record.customFieldValues)
      : standardCell(record, column.key);
  }

  return row;
}

export function toRelationSheets(record: ExportableRecord, sheetRow: number): RelationSheet[] {
  const sheets: RelationSheet[] = [];

  if (record.identifiers && record.identifiers.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.channels,
      headers: [...RELATION_HEADERS.channels],
      rows: record.identifiers.map((identifier) => ({
        row: sheetRow,
        recordId: record.id,
        provider: identifier.provider,
        value: identifier.value,
        displayName: identifier.displayName ?? null,
      })),
    });
  }

  if (record.contacts && record.contacts.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.contacts,
      headers: [...RELATION_HEADERS.contacts],
      rows: record.contacts.map((contact) => ({
        row: sheetRow,
        recordId: record.id,
        contactId: contact.id,
        contactName: personName(contact),
      })),
    });
  }

  if (record.organizations && record.organizations.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.organizations,
      headers: [...RELATION_HEADERS.organizations],
      rows: record.organizations.map((organization) => ({
        row: sheetRow,
        recordId: record.id,
        organizationId: organization.id,
        organizationName: organization.name,
      })),
    });
  }

  if (record.deals && record.deals.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.deals,
      headers: [...RELATION_HEADERS.deals],
      rows: record.deals.map((deal) => ({ row: sheetRow, recordId: record.id, dealId: deal.id, dealName: deal.name })),
    });
  }

  if (record.tasks && record.tasks.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.tasks,
      headers: [...RELATION_HEADERS.tasks],
      rows: record.tasks.map((task) => ({
        row: sheetRow,
        recordId: record.id,
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
      })),
    });
  }

  if (record.services && record.services.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.services,
      headers: [...RELATION_HEADERS.services],
      rows: record.services.map((service) => ({
        row: sheetRow,
        recordId: record.id,
        serviceId: service.id,
        serviceName: service.name,
        amount: service.amount,
        quantity: service.quantity ?? null,
      })),
    });
  }

  if (record.users && record.users.length > 0) {
    sheets.push({
      name: RELATION_SHEET_NAMES.users,
      headers: [...RELATION_HEADERS.users],
      rows: record.users.map((user) => ({
        row: sheetRow,
        recordId: record.id,
        userId: user.id,
        userName: personName(user),
      })),
    });
  }

  return sheets;
}

export function mergeRelationSheets(sheets: RelationSheet[]): RelationSheet[] {
  const merged = new Map<string, RelationSheet>();

  for (const sheet of sheets) {
    const existing = merged.get(sheet.name);
    if (existing) existing.rows.push(...sheet.rows);
    else merged.set(sheet.name, { name: sheet.name, headers: sheet.headers, rows: [...sheet.rows] });
  }

  return [...merged.values()];
}

export function relationSheetNamesFor(entityType: EntityType): string[] {
  switch (entityType) {
    case EntityType.contact:
      return [
        RELATION_SHEET_NAMES.channels,
        RELATION_SHEET_NAMES.organizations,
        RELATION_SHEET_NAMES.deals,
        RELATION_SHEET_NAMES.tasks,
        RELATION_SHEET_NAMES.users,
      ];
    case EntityType.organization:
      return [
        RELATION_SHEET_NAMES.contacts,
        RELATION_SHEET_NAMES.deals,
        RELATION_SHEET_NAMES.tasks,
        RELATION_SHEET_NAMES.users,
      ];
    case EntityType.deal:
      return [
        RELATION_SHEET_NAMES.contacts,
        RELATION_SHEET_NAMES.organizations,
        RELATION_SHEET_NAMES.services,
        RELATION_SHEET_NAMES.tasks,
        RELATION_SHEET_NAMES.users,
      ];
    case EntityType.service:
      return [RELATION_SHEET_NAMES.deals, RELATION_SHEET_NAMES.tasks, RELATION_SHEET_NAMES.users];
    case EntityType.task:
      return [
        RELATION_SHEET_NAMES.contacts,
        RELATION_SHEET_NAMES.organizations,
        RELATION_SHEET_NAMES.deals,
        RELATION_SHEET_NAMES.services,
        RELATION_SHEET_NAMES.users,
      ];
  }
}
