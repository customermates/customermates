import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  exportErrorSourceMaps,
  loadErrorSourceMaps,
  resolveErrorFrames,
  resolveErrorReport,
} from "../error-source-maps";

afterEach(() => vi.unstubAllEnvs());

describe("private error source maps", () => {
  it("exports privately before removing maps and resolves indexed maps by exact build", async () => {
    const root = await mkdtemp(join(tmpdir(), "error-maps-"));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("ERROR_REPORTING_SOURCE_MAP_DIR", ".error-source-maps");
    try {
      await mkdir(join(root, ".next/static"), { recursive: true });
      await mkdir(join(root, ".next/server"), { recursive: true });
      await writeFile(join(root, ".next/BUILD_ID"), "build-1");
      const map = JSON.stringify({
        version: 3,
        sections: [
          {
            offset: { line: 0, column: 0 },
            map: {
              version: 3,
              names: ["fail"],
              sources: ["features/example.ts"],
              sourcesContent: ['throw new Error("synthetic");'],
              mappings: "AAAAA",
            },
          },
        ],
      });
      for (const path of ["static/chunk.js", "server/chunk.js"]) {
        const mapName = path.startsWith("static/") ? "different-hash.js.map" : "[chunk].js.map";
        await writeFile(
          join(root, ".next", path),
          `throw Error();\n//# sourceMappingURL=${encodeURIComponent(mapName)}`,
        );
        await writeFile(join(root, ".next", path.split("/")[0], mapName), map);
      }
      expect(await exportErrorSourceMaps(root)).toEqual({ buildId: "build-1", maps: 2 });
      await expect(readFile(join(root, ".next/static/different-hash.js.map"))).rejects.toThrow();
      expect(await readFile(join(root, ".next/static/chunk.js"), "utf8")).not.toContain("sourceMappingURL");
      const archive = await loadErrorSourceMaps(root, "build-1", [
        { file: "https://preview.example.com/_next/static/chunk.js", line: 1, column: 1 },
      ]);
      expect(
        resolveErrorFrames(archive, "build-1", [
          { file: "https://preview.example.com/_next/static/chunk.js", line: 1, column: 1 },
        ])[0],
      ).toMatchObject({ mapped: true, file: "features/example.ts", line: 1, column: 1 });
      expect(() => resolveErrorFrames(archive, "build-2", [])).toThrow("mismatch");
      await expect(loadErrorSourceMaps(root, "../secret", [])).rejects.toThrow("Invalid");
      expect(
        resolveErrorFrames(archive, "build-1", [{ file: "https://attacker.example.com/file.js", line: 1 }])[0].mapped,
      ).toBe(false);
      const wrapped = await resolveErrorReport(root, {
        buildId: "build-1",
        frames: [{ file: "unknown-wrapper.js", line: 1 }],
        causes: [
          {
            name: "Error",
            message: "underlying failure",
            frames: [{ file: "/var/task/.next/server/chunk.js", line: 1, column: 1 }],
          },
        ],
      });
      expect(wrapped.frames[0].mapped).toBe(false);
      expect(wrapped.causes[0]).toMatchObject({
        name: "Error",
        message: "underlying failure",
        frames: [{ mapped: true, file: "features/example.ts", line: 1, column: 1 }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails without removing public maps when a private archive cannot be created", async () => {
    const root = await mkdtemp(join(tmpdir(), "error-maps-"));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("ERROR_REPORTING_SOURCE_MAP_DIR", "public/maps");
    try {
      await mkdir(join(root, ".next/static"), { recursive: true });
      await mkdir(join(root, ".next/server"), { recursive: true });
      await writeFile(join(root, ".next/BUILD_ID"), "build-1");
      for (const path of ["static/chunk.js.map", "server/chunk.js.map"])
        await writeFile(join(root, ".next", path), "{}");
      await expect(exportErrorSourceMaps(root)).rejects.toThrow("outside deployed assets");
      expect(await readFile(join(root, ".next/static/chunk.js.map"), "utf8")).toBe("{}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves an existing exact-build archive when exclusive creation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "error-maps-"));
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("ERROR_REPORTING_SOURCE_MAP_DIR", ".error-source-maps");
    try {
      for (const path of [".next/static", ".next/server", ".error-source-maps"])
        await mkdir(join(root, path), { recursive: true });
      await writeFile(join(root, ".next/BUILD_ID"), "build-1");
      for (const path of ["static/chunk.js.map", "server/chunk.js.map"])
        await writeFile(join(root, ".next", path), "{}");
      const archive = join(root, ".error-source-maps/build-1.json.gz");
      await writeFile(archive, "existing private archive");
      await expect(exportErrorSourceMaps(root)).rejects.toThrow("EEXIST");
      expect(await readFile(archive, "utf8")).toBe("existing private archive");
      expect(await readFile(join(root, ".next/static/chunk.js.map"), "utf8")).toBe("{}");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
