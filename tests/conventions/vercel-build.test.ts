import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

describe("Vercel build safety", () => {
  it("resets only the dedicated Demo preview and seeds every preview before building", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "vercel-build.sh"), "utf8");
    const demo = script.indexOf(
      '"${VERCEL_ENV:-}" == "preview" && "${VERCEL_TARGET_ENV:-}" == "demo" && "${APP_MODE:-}" == "demo"',
    );
    const reset = script.indexOf("npx --no-install prisma migrate reset --force");
    const demoSeed = script.indexOf("npx --no-install tsx prisma/seed.ts");
    const migrate = script.indexOf("npx --no-install prisma migrate deploy");
    const preview = script.lastIndexOf('[[ "${VERCEL_ENV:-}" == "preview" ]]');
    const previewSeed = script.lastIndexOf("npx --no-install tsx prisma/seed.ts");
    const build = script.indexOf("yarn build");

    expect(demo).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(demo);
    expect(demoSeed).toBeGreaterThan(reset);
    expect(migrate).toBeGreaterThan(demoSeed);
    expect(migrate).toBeGreaterThan(-1);
    expect(preview).toBeGreaterThan(migrate);
    expect(previewSeed).toBeGreaterThan(preview);
    expect(build).toBeGreaterThan(previewSeed);
    expect(script).not.toMatch(/unipile/i);
  });

  it("resolves a direct migration endpoint before touching any database", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "vercel-build.sh"), "utf8");
    // Prisma's migration advisory lock is session-scoped and does not survive a
    // transaction pooler (P1002). DIRECT_URL stays the provider-neutral override;
    // the unpooled fallback is a build-script shim only and must never leak into
    // prisma.config.ts (asserted below).
    const fallback = script.indexOf('export DIRECT_URL="$DATABASE_URL_UNPOOLED"');
    const firstPrisma = script.indexOf("npx --no-install prisma");

    expect(fallback).toBeGreaterThan(-1);
    expect(firstPrisma).toBeGreaterThan(fallback);
  });

  it("fails closed before the destructive Demo reset", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "vercel-build.sh"), "utf8");
    const reset = script.indexOf("npx --no-install prisma migrate reset --force");
    const directUrlGuard = script.indexOf('if [[ -z "${DIRECT_URL:-}" ]]; then');

    // The reset drops the schema before it reapplies migrations, and only the reapply
    // step takes the advisory lock - which times out (P1002) over a transaction
    // pooler, stranding an empty database. The direct-endpoint guard must therefore
    // run first; a guard after the reset is worthless.
    expect(directUrlGuard).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(directUrlGuard);
  });

  it("keeps migration connection configuration provider-neutral", () => {
    const prismaConfig = readFileSync(join(REPO_ROOT, "prisma.config.ts"), "utf8");

    expect(prismaConfig).toContain('process.env.DIRECT_URL?.trim() || env("DATABASE_URL")');
    expect(prismaConfig).not.toContain("DATABASE_URL_UNPOOLED");
  });

  it("uses the same safe build command for every Vercel deployment", () => {
    const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    const vercelJson = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));

    expect(packageJson.scripts["vercel-build"]).toBe("bash scripts/vercel-build.sh");
    expect(packageJson.scripts["vercel-preview-build"]).toBeUndefined();
    expect(vercelJson.buildCommand).toBe("yarn vercel-build");
    expect(vercelJson.git?.deploymentEnabled).toBe(true);
  });
});
