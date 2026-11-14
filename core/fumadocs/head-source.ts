import type { DocCollection } from "fumadocs-mdx/config";
import type { MetaData, PageData, Source } from "fumadocs-core/source";
import type { z } from "zod";
import type * as Config from "./source.config";

import { loader } from "fumadocs-core/source";

import { COLLECTION_LOADERS, type CollectionName } from "./collections";

export type HeadEntry = {
  frontmatter: object;
  fullPath: string;
  lastModified?: string;
  path: string;
};

type CollectionData<Name extends CollectionName> =
  (typeof Config)[Name] extends DocCollection<infer Schema>
    ? Schema extends z.ZodType
      ? z.output<Schema>
      : never
    : never;

type HeadPage<Name extends CollectionName> = CollectionData<Name> &
  PageData & { info: { fullPath: string; path: string }; lastModified?: Date };

function headSource<Name extends CollectionName>(entries: readonly HeadEntry[]) {
  const files = entries.map((entry) => ({
    type: "page" as const,
    path: entry.path,
    absolutePath: entry.fullPath,
    data: {
      ...entry.frontmatter,
      info: { fullPath: entry.fullPath, path: entry.path },
      ...(entry.lastModified ? { lastModified: new Date(entry.lastModified) } : {}),
    },
  }));

  return { files } as unknown as Source<{ metaData: MetaData; pageData: HeadPage<Name> }>;
}

export function headLoader<Name extends CollectionName>(name: Name, entries: readonly HeadEntry[]) {
  return loader({ ...COLLECTION_LOADERS[name], source: headSource<Name>(entries) });
}
