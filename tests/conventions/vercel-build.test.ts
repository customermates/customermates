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
    expect(script).not.toContain("DATABASE_URL_UNPOOLED");
    expect(script).not.toMatch(/unipile/i);
  });

  it("fails closed before the destructive Demo reset", () => {
    const script = readFileSync(join(REPO_ROOT, "scripts", "vercel-build.sh"), "utf8");
    const reset = script.indexOf("npx --no-install prisma migrate reset --force");
    const directUrlGuard = script.indexOf('if [[ -z "${DIRECT_URL:-}" ]]; then');
    const hostGuard = script.indexOf('if [[ -z "${DEMO_DATABASE_HOST:-}" ]]; then');
    const targetGuard = script.indexOf('"$target" != "$DEMO_DATABASE_HOST"/*');

    // The reset drops the schema before it reapplies migrations, so a guard that runs
    // after it is worthless. Every one of these has to come first.
    expect(directUrlGuard).toBeGreaterThan(-1);
    expect(hostGuard).toBeGreaterThan(-1);
    expect(targetGuard).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(directUrlGuard);
    expect(reset).toBeGreaterThan(hostGuard);
    expect(reset).toBeGreaterThan(targetGuard);
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
