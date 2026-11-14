import type { Core, EmitEntry, Plugin, PluginContext } from "fumadocs-mdx";

import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import indexFile from "fumadocs-mdx/plugins/index-file";

type CollectionItem = ReturnType<Core["getCollections"]>[number];
type DocCollectionItem = Extract<CollectionItem, { type: "doc" }>;
type LastModifiedResolver = (filePath: string) => Promise<Date | null>;
type ContentWatcher = { on: (event: "all", listener: (event: string, file: string) => unknown) => unknown };

export const BODY_MODULE_DIRECTORY = "bodies";
export const HEAD_MODULE_DIRECTORY = "heads";

const RESOLVER_CONCURRENCY = 16;

function slash(path: string): string {
  return path.split(sep).join("/");
}

function isDocCollection(collection: CollectionItem): collection is DocCollectionItem {
  return collection.type === "doc";
}

async function collectionFiles(collection: DocCollectionItem): Promise<string[]> {
  const entries = await readdir(collection.dir, { recursive: true }).catch(() => []);

  return entries
    .filter((entry) => collection.hasFile(join(collection.dir, entry)))
    .map(slash)
    .sort();
}

async function mapWithLimit<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]);
      }
    }),
  );

  return results;
}

function scopeToDirectory(core: Core, collection: DocCollectionItem, directory: string): Core {
  const options = { ...core.getOptions(), outDir: join(core.getOptions().outDir, directory) };

  return Object.create(core, {
    getCollections: { value: () => [collection] },
    getOptions: { value: () => options },
  }) as Core;
}

async function bodyModule(core: Core, collection: DocCollectionItem): Promise<EmitEntry> {
  const emit = indexFile({ browser: false, dynamic: false }).emit;
  if (!emit) throw new Error("fumadocs-mdx index-file plugin has no emit step");

  const scoped = scopeToDirectory(core, collection, BODY_MODULE_DIRECTORY);
  const server = (await emit.call({ core: scoped })).find((entry) => entry.path === "server.ts");
  if (!server) throw new Error(`fumadocs-mdx emitted no server index for the ${collection.name} collection`);

  return { path: `${BODY_MODULE_DIRECTORY}/${collection.name}.ts`, content: server.content };
}

export function renderHeadModule(
  collectionName: string,
  entries: readonly { fullPath: string; importPath: string; lastModified: Date | null; path: string }[],
): string {
  const lines = ["// @ts-nocheck"];

  entries.forEach(({ importPath }, index) => {
    lines.push(
      `import { frontmatter as head${index} } from ${JSON.stringify(`${importPath}?collection=${collectionName}&only=frontmatter`)};`,
    );
  });

  lines.push("", `export const ${collectionName} = [`);

  entries.forEach(({ fullPath, lastModified, path }, index) => {
    const fields = [
      `path: ${JSON.stringify(path)}`,
      `fullPath: ${JSON.stringify(fullPath)}`,
      `frontmatter: head${index}`,
    ];
    if (lastModified) fields.push(`lastModified: ${JSON.stringify(lastModified.toISOString())}`);
    lines.push(`  { ${fields.join(", ")} },`);
  });

  lines.push("];", "");

  return lines.join("\n");
}

async function headModule(
  core: Core,
  collection: DocCollectionItem,
  lastModified: LastModifiedResolver,
): Promise<EmitEntry> {
  const outDir = join(core.getOptions().outDir, HEAD_MODULE_DIRECTORY);
  const files = await collectionFiles(collection);
  const entries = await mapWithLimit(files, RESOLVER_CONCURRENCY, async (path) => {
    const absolutePath = join(collection.dir, path);
    const importPath = slash(relative(outDir, absolutePath));

    return {
      fullPath: slash(relative(process.cwd(), absolutePath)),
      importPath: importPath.startsWith(".") ? importPath : `./${importPath}`,
      lastModified: await lastModified(absolutePath).catch(() => null),
      path,
    };
  });

  return {
    path: `${HEAD_MODULE_DIRECTORY}/${collection.name}.ts`,
    content: renderHeadModule(collection.name, entries),
  };
}

export function collectionModules({ lastModified }: { lastModified: LastModifiedResolver }): Plugin {
  return {
    name: "collection-modules",
    async emit(this: PluginContext) {
      const { core } = this;
      const collections = core.getCollections().filter(isDocCollection);
      const entries = await Promise.all(
        collections.flatMap((collection) => [bodyModule(core, collection), headModule(core, collection, lastModified)]),
      );

      return entries;
    },
    configureServer(this: PluginContext, server: { watcher?: unknown }) {
      const { core } = this;
      const watcher = server.watcher as ContentWatcher | undefined;

      watcher?.on("all", async (event, file) => {
        if (event !== "add" && event !== "unlink") return;
        if (!core.getCollections().some((collection) => collection.hasFile(file))) return;

        await core.emit({
          filterPlugin: (plugin) => plugin.name === "collection-modules",
          filterWorkspace: () => false,
          write: true,
        });
      });
    },
  };
}
