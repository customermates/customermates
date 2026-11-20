import "server-only";

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const loadedAsync = new Map<string, Promise<unknown>>();
const loadedSync = new Map<string, unknown>();

function absolute(path: string): string {
  return join(process.cwd(), path);
}

export function readRuntimeJson<T>(path: string): Promise<T> {
  let loaded = loadedAsync.get(path);
  if (!loaded) {
    loaded = readFile(absolute(path), "utf8").then((text) => JSON.parse(text) as unknown);
    loadedAsync.set(path, loaded);
    loaded.catch(() => loadedAsync.delete(path));
  }
  return loaded as Promise<T>;
}

export function readRuntimeJsonSync<T>(path: string): T {
  if (!loadedSync.has(path)) loadedSync.set(path, JSON.parse(readFileSync(absolute(path), "utf8")) as unknown);
  return loadedSync.get(path) as T;
}
