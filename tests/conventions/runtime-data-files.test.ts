import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { TEMPLATE_BUNDLES_DIRECTORY } from "@/core/templates/template-bundle-loader";
import { TEMPLATE_SLUGS } from "@/core/templates/template-slugs";
import { RAW_DOCS_MANIFEST_PATH } from "@/features/mcp-tools/raw-docs-manifest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, walkFiles } from "./walk";

// The template bundles (3.5 MB) and the raw docs manifest (7.8 MB) are read from disk at run time. As JSON modules they
// were emitted once per server layer and chunk group (the manifest six times) and, with the branch's other growth,
// held the production build above Vercel's heap. Reading them costs the build nothing, so the routes have to keep the
// files (output file tracing) and the Docker runner has to copy them.

const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (
  glob: string,
  options: { contains?: boolean; dot?: boolean },
) => (path: string) => boolean;

const SOURCE_FILE = /\.(?:ts|tsx|mjs)$/u;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'`]([^"'`]+)["'`]/gu;
const SCANNED_ROOTS = ["app", "components", "core", "features", "i18n", "ee", "hooks"];
const BUNDLE_IMPORT = /(?:^|\/)bundles\/(?!index\.json$)/u;
const MANIFEST_IMPORT = /raw-docs-manifest\.json$/u;

function repoPath(path: string): string {
  return relative(REPO_ROOT, path).split(sep).join("/");
}

function scannedFiles(): string[] {
  return SCANNED_ROOTS.flatMap((root) =>
    walkFiles(join(REPO_ROOT, root), (path) => SOURCE_FILE.test(path) && !repoPath(path).includes("/__tests__/")),
  );
}

function catchAllTracingIncludes(): string[] {
  const config = readFileSync(join(REPO_ROOT, "next.config.ts"), "utf8");
  const match = /outputFileTracingIncludes:\s*\{[^]*?"\/\*\*":\s*\[([^\]]*)\]/u.exec(config);
  return [...(match?.[1] ?? "").matchAll(/"([^"]+)"/gu)].map((entry) => entry[1].replace(/^\.\//u, ""));
}

describe("runtime data files", () => {
  it(
    "keeps the template bundles and the raw docs manifest out of the webpack graph",
    () => {
      const imports = scannedFiles().flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(IMPORT_SPECIFIER)].map((match) => ({
          file: repoPath(file),
          specifier: match[1],
        })),
      );

      expect(imports.filter(({ specifier }) => BUNDLE_IMPORT.test(specifier))).toEqual([]);
      expect(imports.filter(({ specifier }) => MANIFEST_IMPORT.test(specifier))).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("traces every bundle and the manifest into every route", () => {
    const globs = catchAllTracingIncludes();
    const traced = (path: string) => globs.some((glob) => picomatch(glob, { dot: true })(path));
    const bundles = readdirSync(join(REPO_ROOT, TEMPLATE_BUNDLES_DIRECTORY)).filter((name) => name.endsWith(".json"));

    expect(globs.length).toBeGreaterThan(0);
    for (const slug of TEMPLATE_SLUGS) expect(bundles, slug).toContain(`${slug}.json`);
    for (const name of bundles) expect(traced(`${TEMPLATE_BUNDLES_DIRECTORY}/${name}`), name).toBe(true);
    expect(traced(RAW_DOCS_MANIFEST_PATH)).toBe(true);
    expect(picomatch("/**", { dot: true, contains: true })("/[locale]/templates/[slug]")).toBe(true);
  });

  it("copies the bundles into the Docker runner, which already copies generated/", () => {
    const dockerfile = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8");
    const runner = dockerfile.slice(dockerfile.indexOf("FROM base AS runner"));

    expect(runner).toContain(`COPY --from=builder /app/${TEMPLATE_BUNDLES_DIRECTORY} ./${TEMPLATE_BUNDLES_DIRECTORY}`);
    expect(runner).toContain("COPY --from=builder /app/generated ./generated");
    expect(RAW_DOCS_MANIFEST_PATH.startsWith("generated/")).toBe(true);
  });
});
