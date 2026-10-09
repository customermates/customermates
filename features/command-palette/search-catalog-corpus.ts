import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordViewName } from "./command-catalog.repo";

import { createHash } from "node:crypto";

import { commandSynonyms, STATIC_COMMANDS, staticCommand } from "@/components/keyboard/command-registry";
import { getTranslator } from "@/i18n/get-translator";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

const SEARCH_CATALOG_SCHEMA = "search-catalog-v1";

export type SearchCatalogText = { targetId: string; text: string; contentHash: string };
export type StaticSearchCatalogEntry = SearchCatalogText & { locale: AppLocale };
export type StaticSearchCatalog = { buildHash: string; entries: StaticSearchCatalogEntry[] };

let staticCatalog: Promise<StaticSearchCatalog> | undefined;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function searchCatalogText(targetId: string, parts: readonly (string | null | undefined)[]): SearchCatalogText {
  const text = parts
    .map((part) => part?.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join(". ");
  return { targetId, text, contentHash: sha256(`${SEARCH_CATALOG_SCHEMA}\u0000${text}`) };
}

export function searchCatalogBuildHash(entries: readonly StaticSearchCatalogEntry[]): string {
  return sha256(
    [
      SEARCH_CATALOG_SCHEMA,
      ...entries.map((entry) => [entry.locale, entry.targetId, entry.contentHash].join("\u0000")),
    ].join("\n"),
  );
}

async function buildStaticSearchCatalog(): Promise<StaticSearchCatalog> {
  const entries: StaticSearchCatalogEntry[] = [];
  for (const locale of APP_LOCALES) {
    const translate = await getTranslator(locale);
    const t = (key: string) => translate(key as Parameters<typeof translate>[0]);
    for (const command of STATIC_COMMANDS) {
      const parent = command.parentId ? staticCommand(command.parentId) : undefined;
      const label = t(command.labelKey);
      entries.push({
        locale,
        ...searchCatalogText(`cmd:${command.id}`, [
          parent ? `${t(parent.labelKey)} > ${label}` : label,
          commandSynonyms(t, command.id).join(", "),
        ]),
      });
    }
  }
  return { buildHash: searchCatalogBuildHash(entries), entries };
}

export function staticSearchCatalog(): Promise<StaticSearchCatalog> {
  staticCatalog ??= buildStaticSearchCatalog().catch((error: unknown) => {
    staticCatalog = undefined;
    throw error;
  });
  return staticCatalog;
}

export function workspaceSearchCatalog(model: RecordModel, views: readonly RecordViewName[]): SearchCatalogText[] {
  const lists = new Map(
    model.types
      .filter((type) => !type.archived && !type.embedded && type.navigationVisible)
      .map((type) => [type.id, type]),
  );
  return [
    ...[...lists.values()].map((type) =>
      searchCatalogText(`list:${type.id}`, [
        type.label === type.pluralLabel ? type.label : `${type.pluralLabel}, ${type.label}`,
        type.description,
      ]),
    ),
    ...views.flatMap((view) => {
      const list = lists.get(view.typeId);
      return list ? [searchCatalogText(`view:${view.id}`, [view.name, list.pluralLabel])] : [];
    }),
    ...model.fields.flatMap((field) => {
      const list = lists.get(field.typeId);
      return list && !field.archived ? [searchCatalogText(`field:${field.id}`, [field.label, list.label])] : [];
    }),
  ];
}
