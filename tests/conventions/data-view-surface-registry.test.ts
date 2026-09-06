import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DATA_VIEW_SURFACE_KEYS, SURFACE } from "@/core/data-view/data-view-keys";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const filesUnder = (directory: string): string[] =>
  readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

const pageFiles = filesUnder("app").filter((path) => path.endsWith("/page.tsx"));

const surfaceKeys = new Set<string>(DATA_VIEW_SURFACE_KEYS);
const surfaceNames = new Map<string, string>(Object.entries(SURFACE).map(([name, key]) => [name, key]));

// A page hands the read path a surface through readSurfaceParams, and nothing else may invent a key.
describe("data view surface registry", () => {
  it("declares every surface key exactly once", () => {
    const values = Object.values(SURFACE);
    expect(new Set(values).size).toBe(values.length);
    expect(surfaceKeys).toEqual(new Set(values));
  });

  it("keeps every p13nId literal in a page file inside the registry", () => {
    const offenders = pageFiles.flatMap((path) => {
      const literals = [...read(path).matchAll(/p13nId:\s*"([^"]+)"/g)].map((match) => match[1]);
      return literals.filter((literal) => !surfaceKeys.has(literal)).map((literal) => `${path}: ${literal}`);
    });

    expect(offenders).toEqual([]);
  });

  it("reaches every page surface from a readSurfaceParams call site in a page", () => {
    const reached = new Set<string>();

    for (const path of pageFiles) {
      for (const match of read(path).matchAll(/readSurfaceParams\(\s*SURFACE\.(\w+)/g)) {
        const key = surfaceNames.get(match[1]);
        expect(key, `${path} names an unknown surface SURFACE.${match[1]}`).toBeDefined();
        reached.add(key as string);
      }
    }

    const expected = new Set(Object.values(SURFACE).filter((key) => key !== SURFACE.entityTimeline));
    expect([...reached].sort()).toEqual([...expected].sort());
  });

  it("mounts the embedded timeline surface from the activities panel rather than from a page", () => {
    expect(read("features/messaging/activities/activities.store.ts")).toContain(
      `export const ACTIVITIES_P13N_ID = "${SURFACE.entityTimeline}"`,
    );
  });
});
