import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, relative, join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";

import { AnyMap, originalPositionFor, sourceContentFor } from "@jridgewell/trace-mapping";
import { get, put } from "@vercel/blob";

type Archive = { version: number; buildId: string; maps: Record<string, string>; bundles: Record<string, string> };
type Frame = { file: string; function?: string; line?: number; column?: number };
export type ErrorSourceMapReport = {
  buildId: string;
  frames: Frame[];
  causes?: { name: string; message: string; frames: Frame[] }[];
};

function checkedBuildId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("Invalid error reporting build ID");
  return value;
}

function localDirectory(root: string): string {
  const directory = resolve(root, process.env.ERROR_REPORTING_SOURCE_MAP_DIR ?? ".error-source-maps");
  for (const forbidden of ["public", "app", ".next"]) {
    const path = relative(resolve(root, forbidden), directory);
    if (!path || (!path.startsWith("..") && !path.startsWith("/")))
      throw new Error("Source maps must stay outside deployed assets");
  }
  return directory;
}

async function mapFiles(directory: string, pattern = /\.map$/): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await mapFiles(file, pattern)));
    else if (entry.isFile() && pattern.test(file)) result.push(file);
  }
  return result.sort();
}

export async function exportErrorSourceMaps(root: string): Promise<{ buildId: string; maps: number }> {
  const buildId = checkedBuildId((await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim());
  const files = (
    await Promise.all(["static", "server"].map((directory) => mapFiles(join(root, ".next", directory))))
  ).flat();
  if (!files.some((file) => file.includes("/static/")) || !files.some((file) => file.includes("/server/")))
    throw new Error("Both browser and server source maps are required");
  if (process.env.VERCEL && process.env.ERROR_REPORTING_SOURCE_MAP_DIR)
    throw new Error("Hosted builds require private Blob storage");
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Private Blob storage is required");
  const nextDirectory = join(root, ".next");
  const assets = (
    await Promise.all(["static", "server"].map((directory) => mapFiles(join(nextDirectory, directory), /\.(js|css)$/)))
  ).flat();
  const knownMaps = new Set(files);
  const bundles: Record<string, string> = {};
  for (const asset of assets) {
    const content = await readFile(asset, "utf8");
    const reference = /sourceMappingURL=([^\s*]+)/.exec(content.slice(-1000))?.[1];
    const map = reference ? resolve(dirname(asset), decodeURIComponent(reference)) : `${asset}.map`;
    if (!knownMaps.has(map)) {
      if (reference) throw new Error("A bundle references an unavailable source map");
      continue;
    }
    bundles[relative(nextDirectory, asset).replaceAll("\\", "/")] = relative(nextDirectory, map).replaceAll("\\", "/");
  }
  const directory = localDirectory(root);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${buildId}.json.gz`);
  const handle = await open(file, "wx", 0o600);
  const gzip = createGzip();
  const output = pipeline(gzip, handle.createWriteStream());
  void output.catch(() => undefined);
  // Stream one map at a time so exporting does not retain the entire source graph.
  const write = async (value: string) => {
    if (!gzip.write(value)) await once(gzip, "drain");
  };
  try {
    await write(`${JSON.stringify({ version: 2, buildId, bundles })}\n`);
    for (let index = 0; index < files.length; index++) {
      const map = await readFile(files[index], "utf8");
      JSON.parse(map);
      const path = relative(join(root, ".next"), files[index]).replaceAll("\\", "/");
      await write(`${JSON.stringify({ path, map })}\n`);
    }
    gzip.end();
    await output;
    if (process.env.VERCEL) {
      await put(`error-source-maps/${buildId}.json.gz`, createReadStream(file), {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: "application/gzip",
      });
    }
    // Removal happens only after a successful private export. A failed export
    // fails the deployment instead of publishing browser source maps.
    for (const asset of assets.filter((asset) => relative(nextDirectory, asset).startsWith("static/"))) {
      const content = await readFile(asset, "utf8");
      const stripped = content.replace(
        /(?:\n?\/\/[@#] sourceMappingURL=[^\n]+\s*$|\/\*[@#] sourceMappingURL=[^*]+\*\/\s*$)/,
        "",
      );
      if (stripped !== content) await writeFile(asset, stripped);
    }
    await Promise.all(files.filter((map) => relative(nextDirectory, map).startsWith("static/")).map((map) => rm(map)));
    return { buildId, maps: files.length };
  } catch (error) {
    gzip.destroy();
    await output.catch(() => undefined);
    await rm(file, { force: true });
    throw error;
  }
}

function mapPath(filename: string): string | undefined {
  let file = filename.split(/[?#]/, 1)[0].replaceAll("\\", "/");
  try {
    file = decodeURIComponent(file);
  } catch {
    return undefined;
  }
  const browser = file.indexOf("/_next/static/");
  if (browser !== -1) return `static/${file.slice(browser + "/_next/static/".length)}`;
  const server = file.indexOf("/.next/server/");
  if (server !== -1) return `server/${file.slice(server + "/.next/server/".length)}`;
  if (file.startsWith("server/") || file.startsWith("static/")) return file;
  return undefined;
}

export function resolveErrorFrames(archive: Archive, buildId: string, frames: Frame[]) {
  if (archive.version !== 2 || archive.buildId !== checkedBuildId(buildId))
    throw new Error("Source-map build mismatch");
  return frames.map((frame) => {
    const bundle = mapPath(frame.file);
    const key = bundle && Object.hasOwn(archive.bundles, bundle) ? archive.bundles[bundle] : undefined;
    const source = key && Object.hasOwn(archive.maps, key) ? archive.maps[key] : undefined;
    if (!source || !frame.line) return { ...frame, mapped: false };
    const map = AnyMap(JSON.parse(source));
    const position = originalPositionFor(map, { line: frame.line, column: Math.max(0, (frame.column ?? 1) - 1) });
    if (!position.source || !position.line) return { ...frame, mapped: false };
    const content = sourceContentFor(map, position.source);
    return {
      file: position.source,
      function: position.name ?? frame.function,
      line: position.line,
      column: (position.column ?? 0) + 1,
      mapped: true,
      context: content?.split("\n").slice(Math.max(0, position.line - 3), position.line + 2),
    };
  });
}

export async function loadErrorSourceMaps(root: string, buildId: string, frames: Frame[]): Promise<Archive> {
  checkedBuildId(buildId);
  let compressed: Readable;
  if (process.env.ERROR_REPORTING_SOURCE_MAP_DIR || !process.env.BLOB_READ_WRITE_TOKEN)
    compressed = createReadStream(join(localDirectory(root), `${buildId}.json.gz`));
  else {
    const blob = await get(`error-source-maps/${buildId}.json.gz`, {
      access: "private",
      useCache: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!blob || blob.statusCode !== 200 || !blob.stream)
      throw new Error("Exact build's private source maps are unavailable");
    compressed = Readable.fromWeb(blob.stream as NodeReadableStream<Uint8Array>);
  }
  const unzip = createGunzip();
  const complete = pipeline(compressed, unzip);
  void complete.catch(() => undefined);
  const lines = createInterface({ input: unzip, crlfDelay: Infinity });
  let archive: Archive | undefined;
  let wanted = new Set<string>();
  try {
    for await (const line of lines) {
      if (!archive) {
        const metadata = JSON.parse(line) as Omit<Archive, "maps">;
        if (
          metadata.version !== 2 ||
          metadata.buildId !== buildId ||
          !metadata.bundles ||
          typeof metadata.bundles !== "object"
        )
          throw new Error("Invalid source-map archive");
        archive = { ...metadata, maps: {} };
        wanted = new Set(
          frames.flatMap((frame) => {
            const bundle = mapPath(frame.file);
            return bundle && Object.hasOwn(metadata.bundles, bundle) ? [metadata.bundles[bundle]] : [];
          }),
        );
      } else {
        const entry = JSON.parse(line) as { path: string; map: string };
        if (typeof entry.path !== "string" || typeof entry.map !== "string")
          throw new Error("Invalid source-map entry");
        if (wanted.has(entry.path)) archive.maps[entry.path] = entry.map;
      }
    }
    await complete;
    if (!archive) throw new Error("Empty source-map archive");
    return archive;
  } finally {
    lines.close();
    compressed.destroy();
    unzip.destroy();
    await complete.catch(() => undefined);
  }
}

export async function resolveErrorReport(root: string, report: ErrorSourceMapReport) {
  const causes = report.causes ?? [];
  const archive = await loadErrorSourceMaps(root, report.buildId, [
    ...report.frames,
    ...causes.flatMap((cause) => cause.frames),
  ]);
  return {
    buildId: report.buildId,
    frames: resolveErrorFrames(archive, report.buildId, report.frames),
    causes: causes.map((cause) => ({
      name: cause.name,
      message: cause.message,
      frames: resolveErrorFrames(archive, report.buildId, cause.frames),
    })),
  };
}
