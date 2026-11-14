import { readRuntimeJsonSync } from "@/core/utils/runtime-json";

export type RawDocsPage = { title: string; description: string; content: string };
export type RawDocsManifest = Record<string, Record<string, Record<string, RawDocsPage>>>;

export const RAW_DOCS_MANIFEST_PATH = "generated/raw-docs-manifest.json";

export function rawDocsManifest<T extends RawDocsManifest = RawDocsManifest>(): T {
  return readRuntimeJsonSync<T>(RAW_DOCS_MANIFEST_PATH);
}
